# --- START OF FILE OrTools.py ---

from ortools.sat.python import cp_model
import logging

logger = logging.getLogger(__name__)


def available_shift(variables, available, id_to_worker):
    """
    Filters possible_workers for each variable to only workers who:
      1. Are eligible for the role (already set in run_algo)
      2. Declared availability for that (day, shiftId)
    """
    logger.info("Filtering possible workers by declared availability...")
    try:
        for var_name, var_info in variables.items():
            day = var_info["day"]
            shift_id = var_info["shiftId"]

            available_ids = set(available.get(day, {}).get(shift_id, []))
            eligible_ids = {w["_id"] for w in var_info["possible_workers"]}

            filtered_ids = eligible_ids & available_ids
            var_info["possible_workers"] = [id_to_worker[wid] for wid in filtered_ids if wid in id_to_worker]

        logger.info("Finished filtering possible workers.")
        return variables
    except Exception as e:
        logger.error(f"Error in available_shift: {e}", exc_info=True)
        return variables


def variables_for_shifts(variables, model):
    """
    Creates OR-Tools integer variables.
    Each variable's domain = IDs of workers who can fill that slot.
    """
    logger.info("Creating OR-Tools model variables...")
    variable_model = {}
    try:
        for var_name, var_info in variables.items():
            possible_ids = [w["_id"] for w in var_info.get("possible_workers", [])]
            if not possible_ids:
                logger.warning(f"Slot '{var_name}' has no possible workers (will need dummy).")
                continue
            domain = cp_model.Domain.FromValues(possible_ids)
            variable_model[var_name] = model.NewIntVarFromDomain(domain, var_name)

        logger.info(f"Created {len(variable_model)} OR-Tools variables.")
        return variable_model
    except Exception as e:
        logger.error(f"Error in variables_for_shifts: {e}", exc_info=True)
        return {}
