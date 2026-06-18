# --- START OF FILE MongoConnection.py ---

import os
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError
import logging

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)

mongo_client = None
mongo_db = None


def connect_to_mongo():
    global mongo_client, mongo_db
    if mongo_client is None:
        try:
            logger.info("Attempting to connect to MongoDB...")
            MONGO_URI = os.environ.get("MONGO_URI")
            if not MONGO_URI:
                logger.error("Missing MONGO_URI environment variable. Create a .env file.")
                return False
            mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            mongo_client.admin.command('ismaster')
            mongo_db = mongo_client["safeshift"]
            logger.info("MongoDB connection successful.")
            return True
        except (ConnectionFailure, ConfigurationError) as e:
            logger.error(f"Failed to connect to MongoDB: {e}", exc_info=True)
            mongo_client = None
            mongo_db = None
            return False
        except Exception as e:
            logger.error(f"Unexpected error during MongoDB connection: {e}", exc_info=True)
            mongo_client = None
            mongo_db = None
            return False
    return True


def connect():
    if mongo_db is None:
        connect_to_mongo()
    return mongo_db


def getData(user_id):
    """
    Fetches organization config and employees for the org that user_id manages.
    Returns:
      {
        "organization": { ...org doc... },
        "employees": [ ...employee docs... ]
      }
    or None on failure.
    """
    if not connect_to_mongo():
        return None

    try:
        logger.info(f"Fetching data for user_id: {user_id}")

        manager = mongo_db["employees"].find_one({"_id": int(user_id)})
        if not manager:
            logger.warning(f"Employee not found with ID: {user_id}")
            return None

        org_id = manager.get("organizationId")
        if not org_id:
            logger.warning(f"Employee {user_id} has no organizationId.")
            return None

        org = mongo_db["organizations"].find_one({"_id": org_id})
        if not org:
            logger.warning(f"Organization not found: {org_id}")
            return None

        employees = list(mongo_db["employees"].find({"organizationId": org_id}))
        logger.info(f"Found {len(employees)} employees for org '{org['name']}'.")

        return {"organization": org, "employees": employees}

    except ValueError:
        logger.error(f"Invalid user_id format: '{user_id}'. Must be a number.")
        return None
    except Exception as e:
        logger.error(f"Unexpected error in getData for user_id {user_id}: {e}", exc_info=True)
        return None


def close_mongo_connection():
    global mongo_client, mongo_db
    if mongo_client:
        try:
            mongo_client.close()
            mongo_client = None
            mongo_db = None
            logger.info("MongoDB connection closed.")
        except Exception as e:
            logger.error(f"Error closing MongoDB connection: {e}", exc_info=True)
