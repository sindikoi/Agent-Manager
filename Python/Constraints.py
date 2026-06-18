# --- START OF FILE Constraints.py ---

import logging
import argparse
import time
from datetime import datetime, timedelta

try:
    from ortools.sat.python import cp_model
    import schedule
except ImportError as e:
    print(f"Error: Missing required library. Please install it: {e}")
    exit(1)

from Algo import run_algo, available_workers
from OrTools import available_shift, variables_for_shifts
from MongoConnection import connect_to_mongo, connect

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)-12s - %(levelname)-8s - %(message)s'
)
logger = logging.getLogger(__name__)

DUMMY_ID = -1

# ==============================================================================
# CONSTRAINT FUNCTIONS
# ==============================================================================

def one_shift_per_day(variables, model, workers, variable_model, days):
    """Each worker assigned to at most one shift per day."""
    for worker in workers:
        worker_id = worker["_id"]
        if worker_id == DUMMY_ID:
            continue
        for day in days:
            daily_assignments = []
            for var_name, var_info in variables.items():
                if var_info["day"] == day and worker_id in [w["_id"] for w in var_info["possible_workers"]]:
                    cp_var = variable_model[var_name]
                    assigned = model.NewBoolVar(f"{var_name}_assigned_to_{worker_id}")
                    model.Add(cp_var == worker_id).OnlyEnforceIf(assigned)
                    model.Add(cp_var != worker_id).OnlyEnforceIf(assigned.Not())
                    daily_assignments.append(assigned)
            if daily_assignments:
                model.Add(sum(daily_assignments) <= 1)


def at_least_one_day_off(variables, model, workers, variable_model, days):
    """Each worker works at most maxWorkDaysPerWeek days (default 6)."""
    for worker in workers:
        worker_id = worker["_id"]
        if worker_id == DUMMY_ID:
            continue
        works_day_list = []
        for day in days:
            daily_assignments = []
            for var_name, var_info in variables.items():
                if var_info["day"] == day and worker_id in [w["_id"] for w in var_info["possible_workers"]]:
                    cp_var = variable_model[var_name]
                    assigned = model.NewBoolVar(f"{var_name}_assigned_to_{worker_id}_dayoff")
                    model.Add(cp_var == worker_id).OnlyEnforceIf(assigned)
                    model.Add(cp_var != worker_id).OnlyEnforceIf(assigned.Not())
                    daily_assignments.append(assigned)
            if daily_assignments:
                works_that_day = model.NewBoolVar(f"worker_{worker_id}_works_on_{day}")
                model.AddMaxEquality(works_that_day, daily_assignments)
                works_day_list.append(works_that_day)
        if works_day_list:
            model.Add(sum(works_day_list) <= 6)


def apply_forbidden_shift_sequences(variables, model, workers, variable_model, days, forbidden_sequences):
    """
    Generic replacement for no_morning_after_evening.
    forbidden_sequences: list of {from: shiftId_A, to: shiftId_B, sameNextDay: bool}
    Prevents a worker from working shiftId_B the day after shiftId_A.
    """
    if not forbidden_sequences:
        return

    for rule in forbidden_sequences:
        shift_from = rule["from"]
        shift_to = rule["to"]

        for worker in workers:
            worker_id = worker["_id"]
            if worker_id == DUMMY_ID:
                continue

            for i in range(len(days) - 1):
                day_from = days[i]
                day_to = days[i + 1]

                from_bools = []
                for var_name, var_info in variables.items():
                    if var_info["day"] == day_from and var_info["shiftId"] == shift_from:
                        if worker_id in [w["_id"] for w in var_info["possible_workers"]]:
                            b = model.NewBoolVar(f"w{worker_id}_{var_name}_from")
                            model.Add(variable_model[var_name] == worker_id).OnlyEnforceIf(b)
                            model.Add(variable_model[var_name] != worker_id).OnlyEnforceIf(b.Not())
                            from_bools.append(b)

                to_bools = []
                for var_name, var_info in variables.items():
                    if var_info["day"] == day_to and var_info["shiftId"] == shift_to:
                        if worker_id in [w["_id"] for w in var_info["possible_workers"]]:
                            b = model.NewBoolVar(f"w{worker_id}_{var_name}_to")
                            model.Add(variable_model[var_name] == worker_id).OnlyEnforceIf(b)
                            model.Add(variable_model[var_name] != worker_id).OnlyEnforceIf(b.Not())
                            to_bools.append(b)

                if from_bools and to_bools:
                    works_from = model.NewBoolVar(f"w{worker_id}_{day_from}_{shift_from}")
                    model.AddBoolOr(from_bools).OnlyEnforceIf(works_from)
                    for b in from_bools:
                        model.AddImplication(works_from.Not(), b.Not())

                    works_to = model.NewBoolVar(f"w{worker_id}_{day_to}_{shift_to}")
                    model.AddBoolOr(to_bools).OnlyEnforceIf(works_to)
                    for b in to_bools:
                        model.AddImplication(works_to.Not(), b.Not())

                    model.AddImplication(works_from, works_to.Not())


def apply_cross_week_forbidden_sequences(variables, model, variable_model, workers_to_restrict,
                                         forbidden_sequences, days):
    """
    Generalised version of prevent_sunday_morning_after_saturday_evening_last_week.
    Restricts workers who worked the last shift of prev week from working the first shift of this week,
    if that sequence is in forbidden_sequences.
    """
    if not workers_to_restrict or not forbidden_sequences or not days:
        return

    last_day = days[-1]
    first_day = days[0]

    for rule in forbidden_sequences:
        shift_from = rule["from"]
        shift_to = rule["to"]

        for worker_id in workers_to_restrict:
            for var_name, var_info in variables.items():
                if var_info["day"] == first_day and var_info["shiftId"] == shift_to:
                    if worker_id in [w["_id"] for w in var_info["possible_workers"]]:
                        model.Add(variable_model[var_name] != worker_id)


def fairness_constraint(variables, model, workers, variable_model):
    """Balances shift counts across workers (max diff = 3)."""
    worker_ids = [w["_id"] for w in workers if w["_id"] != DUMMY_ID]
    if len(worker_ids) < 2:
        return

    shift_counts = {}
    for worker_id in worker_ids:
        num_shifts = model.NewIntVar(0, len(variables), f"shifts_for_{worker_id}")
        assigned_bools = []
        for var_name, cp_var in variable_model.items():
            if worker_id in [w["_id"] for w in variables[var_name]["possible_workers"]]:
                is_assigned = model.NewBoolVar(f"{var_name}_to_{worker_id}_fair")
                model.Add(cp_var == worker_id).OnlyEnforceIf(is_assigned)
                model.Add(cp_var != worker_id).OnlyEnforceIf(is_assigned.Not())
                assigned_bools.append(is_assigned)
        model.Add(num_shifts == sum(assigned_bools))
        shift_counts[worker_id] = num_shifts

    counts_list = list(shift_counts.values())
    for i in range(len(counts_list)):
        for j in range(i + 1, len(counts_list)):
            diff = counts_list[i] - counts_list[j]
            model.Add(-3 <= diff)
            model.Add(diff <= 3)


# ==============================================================================
# SOLUTION PROCESSING & DUMMY MANAGEMENT
# ==============================================================================

def solution_by_day(solver, variable_model, variables, days):
    """Structures solved schedule as {day: {shiftId: [{roleId, var_name, worker_id}]}}."""
    # Collect all shiftIds that appear in variables
    shift_ids = sorted({v["shiftId"] for v in variables.values()})
    schedule_by_day = {day: {sid: [] for sid in shift_ids} for day in days}

    for var_name, cp_var in variable_model.items():
        info = variables[var_name]
        day, shift_id, role_id = info["day"], info["shiftId"], info["roleId"]
        worker_id = solver.Value(cp_var)
        schedule_by_day[day][shift_id].append({
            "roleId": role_id,
            "var_name": var_name,
            "worker_id": worker_id
        })
    return schedule_by_day


def print_solution(schedule_by_day, id_to_name_map):
    logger.info("--- Final Generated Schedule ---")
    for day, shifts in schedule_by_day.items():
        lines = [f"\n=== {day.upper()} ==="]
        for shift_id, assignments in shifts.items():
            if not assignments:
                continue
            lines.append(f"  -- {shift_id} --")
            for a in assignments:
                name = id_to_name_map.get(str(a["worker_id"]), f"ID {a['worker_id']}")
                lines.append(f"    {a['roleId']:<20}: {name}")
        logger.info("".join(lines))


def add_per_shift_dummies(variables, id_to_worker):
    dummy_ids = {}
    for idx, (var_name, var_info) in enumerate(variables.items()):
        dummy_id = -(idx + 1)
        dummy_worker = {"_id": dummy_id, "name": f"Dummy({var_name})"}
        var_info["possible_workers"].append(dummy_worker)
        id_to_worker[dummy_id] = dummy_worker
        dummy_ids[var_name] = dummy_id
    return dummy_ids


def minimize_dummy_usage(model, variable_model, dummy_ids):
    penalty_vars = []
    for var_name, cp_var in variable_model.items():
        if var_name in dummy_ids:
            is_dummy = model.NewBoolVar(f"{var_name}_is_dummy")
            model.Add(cp_var == dummy_ids[var_name]).OnlyEnforceIf(is_dummy)
            model.Add(cp_var != dummy_ids[var_name]).OnlyEnforceIf(is_dummy.Not())
            penalty_vars.append(is_dummy)
    model.Minimize(sum(penalty_vars))


# ==============================================================================
# MAIN
# ==============================================================================

def main(previous_week_schedule_data=None, run_for_manager_id=None, target_week_start_date_str=None):
    try:
        model = cp_model.CpModel()
        manager_id = run_for_manager_id if run_for_manager_id is not None else 101
        days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

        logger.info(f"Running for manager_id={manager_id}, week={target_week_start_date_str}")

        result = run_algo(manager_id)
        if not result:
            logger.critical("run_algo failed. Aborting.")
            return

        org = result["organization"]
        employees = result["employees"]
        forbidden_sequences = org.get("constraints", {}).get("forbiddenShiftSequences", [])

        avail, id_to_worker = available_workers(employees)
        variables = available_shift(result["variables"], avail, id_to_worker)

        dummy_ids = add_per_shift_dummies(variables, id_to_worker)
        variable_model = variables_for_shifts(variables, model)

        if not variable_model:
            logger.critical("No OR-Tools variables created. Check scheduleRequirements. Aborting.")
            return

        logger.info("Applying constraints...")
        one_shift_per_day(variables, model, employees, variable_model, days)
        at_least_one_day_off(variables, model, employees, variable_model, days)
        apply_forbidden_shift_sequences(variables, model, employees, variable_model, days, forbidden_sequences)
        fairness_constraint(variables, model, employees, variable_model)

        # Cross-week constraint: workers from last Saturday's final shift
        prev_shift_workers = set()
        if previous_week_schedule_data and forbidden_sequences:
            last_shift_id = forbidden_sequences[0]["from"]  # e.g. "evening"
            saturday_last = previous_week_schedule_data.get("Saturday", {}).get(last_shift_id, [])
            for a in saturday_last:
                if isinstance(a, dict) and a.get("worker_id", 0) > 0:
                    prev_shift_workers.add(a["worker_id"])

        apply_cross_week_forbidden_sequences(
            variables, model, variable_model, prev_shift_workers, forbidden_sequences, days
        )

        minimize_dummy_usage(model, variable_model, dummy_ids)
        logger.info("All constraints applied.")

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 60.0
        status = solver.Solve(model)

        if status not in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            logger.error(f"No solution found. Status: {solver.StatusName(status)}")
            return

        logger.info(f"Solution found! Status: {solver.StatusName(status)}")
        id_to_name_map = {str(k): v.get("name", "Unknown") for k, v in id_to_worker.items()}
        schedule_by_day = solution_by_day(solver, variable_model, variables, days)
        print_solution(schedule_by_day, id_to_name_map)

        db = connect()
        if db is None:
            logger.error("Cannot connect to DB. Solution not saved.")
            return

        try:
            org_name = org["name"]
            org_id = org["_id"]

            db["result"].update_many(
                {"organizationId": org_id, "Week": "Now"},
                {"$set": {"Week": "Old"}}
            )

            partial_notes = []
            for day, shifts in schedule_by_day.items():
                for shift_id, assignments in shifts.items():
                    for a in assignments:
                        if a["worker_id"] < 0:
                            partial_notes.append({"shift": f"{day} {shift_id}", "roleId": a["roleId"]})

            relevant_date = datetime.strptime(target_week_start_date_str, "%Y-%m-%d") + timedelta(days=1)
            relevant_date_str = relevant_date.strftime("%Y-%m-%d")

            result_doc = {
                "organizationId": org_id,
                "organizationName": org_name,
                "generatedAt": datetime.now(),
                "schedule": schedule_by_day,
                "status": "partial" if partial_notes else "full",
                "notes": partial_notes,
                "Week": "Now",
                "relevantWeekStartDate": relevant_date_str,
                "idToName": id_to_name_map
            }

            db["result"].replace_one(
                {"organizationId": org_id, "relevantWeekStartDate": relevant_date_str},
                result_doc,
                upsert=True
            )
            logger.info(f"Schedule saved for week {target_week_start_date_str}.")

        except Exception as e:
            logger.error(f"Failed to save to MongoDB: {e}", exc_info=True)

    except Exception as e:
        logger.critical(f"Critical error in main: {e}", exc_info=True)


# ==============================================================================
# SCHEDULED RUN & CLI
# ==============================================================================

def scheduled_auto():
    logger.info(f"--- Auto run at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
    db = connect()
    if not db:
        logger.error("Failed to connect to DB. Aborting auto run.")
        return

    DEFAULT_MANAGER_ID = 101  # first manager in seed data

    try:
        manager_doc = db["employees"].find_one({"_id": DEFAULT_MANAGER_ID})
        if not manager_doc or not manager_doc.get("organizationId"):
            logger.error(f"Cannot find org for manager {DEFAULT_MANAGER_ID}. Aborting.")
            return

        org_id = manager_doc["organizationId"]
        last_schedule = db["result"].find_one({"organizationId": org_id, "Week": "Now"}, sort=[("generatedAt", -1)])

        today = datetime.now()
        start_of_week = today - timedelta(days=today.weekday())
        target = (start_of_week + timedelta(days=7)).strftime("%Y-%m-%d")

        main(
            previous_week_schedule_data=last_schedule.get("schedule") if last_schedule else None,
            run_for_manager_id=DEFAULT_MANAGER_ID,
            target_week_start_date_str=target
        )
    except Exception as e:
        logger.error(f"Auto run error: {e}", exc_info=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generic Shift Scheduler")
    parser.add_argument("--mode", choices=["manual", "auto"], default="manual")
    parser.add_argument("--manager-id", type=int, default=101)
    parser.add_argument("--target-week", type=str)
    args = parser.parse_args()

    if args.mode == "manual":
        logger.info("--- MANUAL mode ---")
        if args.target_week:
            target_week = args.target_week
        else:
            today = datetime.now()
            start = today - timedelta(days=today.weekday())
            target_week = (start + timedelta(days=7)).strftime("%Y-%m-%d")
            logger.info(f"Defaulting to next week: {target_week}")

        db = connect()
        prev_data = None
        if db is not None:
            try:
                mgr = db["employees"].find_one({"_id": args.manager_id})
                if mgr:
                    org_id = mgr.get("organizationId")
                    last = db["result"].find_one({"organizationId": org_id}, sort=[("generatedAt", -1)])
                    if last:
                        prev_data = last.get("schedule")
                        logger.info(f"Found previous schedule from {last.get('generatedAt')}")
            except Exception as e:
                logger.error(f"Could not fetch previous schedule: {e}", exc_info=True)

        main(
            previous_week_schedule_data=prev_data,
            run_for_manager_id=args.manager_id,
            target_week_start_date_str=target_week
        )

    elif args.mode == "auto":
        logger.info("--- AUTO mode ---")
        # Uncomment to enable weekly auto-run:
        # schedule.every().sunday.at("02:00").do(scheduled_auto)
        scheduled_auto()
