# --- START OF FILE Algo.py ---

from MongoConnection import getData
import logging

logger = logging.getLogger(__name__)


def _employee_eligible_for_role(employee, role):
    """Returns True if the employee meets all requirements for the given role dict."""
    if role.get("isManagerRole"):
        return employee.get("isManager", False)
    required = set(role.get("requiredQualifications", []))
    if not required:
        return True  # any employee can fill a role with no requirements
    return required.issubset(set(employee.get("qualifications", [])))


def run_algo(user_id):
    """
    Fetches data and creates shift variables for the generic scheduling problem.
    Each variable represents one slot: (shiftId, roleId, day, index).
    Returns:
      {
        "variables": {var_name: {shiftId, roleId, day, possible_workers}},
        "employees": [employee_doc, ...],
        "organization": org_doc
      }
    """
    logger.info(f"Starting run_algo for user_id: {user_id}")
    data = getData(user_id)

    if data is None:
        logger.error(f"Could not retrieve data for user_id {user_id}. Aborting.")
        return None

    try:
        org = data["organization"]
        employees = data["employees"]

        # Build role lookup: id -> role dict
        roles_by_id = {r["id"]: r for r in org.get("roles", [])}

        variables = {}
        schedule_req = org.get("scheduleRequirements", {})

        for day, shifts in schedule_req.items():
            for shift_id, roles in shifts.items():
                for role_id, count in roles.items():
                    role = roles_by_id.get(role_id)
                    if role is None:
                        logger.warning(f"Role '{role_id}' in scheduleRequirements not found in org.roles. Skipping.")
                        continue

                    possible = [e for e in employees if _employee_eligible_for_role(e, role)]

                    for i in range(count):
                        var_name = f"{shift_id}__{role_id}__{day}__{i}"
                        variables[var_name] = {
                            "shiftId": shift_id,
                            "roleId": role_id,
                            "day": day,
                            "possible_workers": list(possible)  # filtered further in OrTools
                        }

        logger.info(f"Created {len(variables)} shift variables.")
        return {
            "variables": variables,
            "employees": employees,
            "organization": org
        }

    except KeyError as e:
        logger.error(f"Missing expected key in data: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Unexpected error in run_algo: {e}", exc_info=True)
        return None


def available_workers(employees):
    """
    Builds availability lookup from employee selectedDays.
    Returns:
      available: {day: {shiftId: [employee_id, ...]}}
      id_to_worker: {employee_id: employee_doc}
    """
    logger.info("Processing worker availability...")
    available = {}
    id_to_worker = {}

    try:
        for emp in employees:
            emp_id = emp["_id"]
            id_to_worker[emp_id] = emp

            for day_info in emp.get("selectedDays", []):
                day = day_info.get("day")
                if not day:
                    continue
                for shift_id in day_info.get("shifts", []):
                    available.setdefault(day, {}).setdefault(shift_id, set()).add(emp_id)

        # Convert sets to lists
        for day in available:
            for shift_id in available[day]:
                available[day][shift_id] = list(available[day][shift_id])

        logger.info("Worker availability processing complete.")
        return available, id_to_worker

    except Exception as e:
        logger.error(f"Error in available_workers: {e}", exc_info=True)
        return {}, {}
