"""
seed_data.py - מכניס ל-DB ארגון דמה (בית קפה) עם עובדים לדוגמה.
מריצים פעם אחת כדי לבדוק את הסקדולר הגנרי E2E.
"""

import os
import sys
import logging
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure
except ImportError:
    print("Error: pymongo not installed. Run: pip install pymongo")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

ORGANIZATION = {
    "_id": "org_cafe_001",
    "name": "בית קפה ארומה תל אביב",

    "shiftTypes": [
        {"id": "morning", "name": "בוקר", "startTime": "07:00", "endTime": "15:00"},
        {"id": "evening", "name": "ערב",  "startTime": "15:00", "endTime": "23:00"}
    ],

    "qualifications": [
        {"id": "barista",       "name": "הכשרת בריסטה"},
        {"id": "cashier_cert",  "name": "הרשאת קופה"},
        {"id": "food_handler",  "name": "תעודת עוסק במזון"}
    ],

    "roles": [
        {
            "id": "shift_manager",
            "name": "אחראי משמרת",
            "requiredQualifications": [],
            "isManagerRole": True
        },
        {
            "id": "barista_role",
            "name": "בריסטה",
            "requiredQualifications": ["barista"],
            "isManagerRole": False
        },
        {
            "id": "cashier_role",
            "name": "קופאי",
            "requiredQualifications": ["cashier_cert"],
            "isManagerRole": False
        }
    ],

    # כמה עובדים נדרשים בכל (יום, משמרת, תפקיד)
    "scheduleRequirements": {
        "Sunday":    {"morning": {"shift_manager": 1, "barista_role": 1, "cashier_role": 1},
                      "evening": {"shift_manager": 1, "barista_role": 1}},
        "Monday":    {"morning": {"shift_manager": 1, "barista_role": 1, "cashier_role": 1},
                      "evening": {"shift_manager": 1, "barista_role": 1}},
        "Tuesday":   {"morning": {"shift_manager": 1, "barista_role": 1, "cashier_role": 1},
                      "evening": {"shift_manager": 1, "barista_role": 1}},
        "Wednesday": {"morning": {"shift_manager": 1, "barista_role": 1, "cashier_role": 1},
                      "evening": {"shift_manager": 1, "barista_role": 1}},
        "Thursday":  {"morning": {"shift_manager": 1, "barista_role": 1, "cashier_role": 1},
                      "evening": {"shift_manager": 1, "barista_role": 1}},
        "Friday":    {"morning": {"shift_manager": 1, "barista_role": 1},
                      "evening": {"shift_manager": 1, "barista_role": 1}},
        "Saturday":  {"morning": {"shift_manager": 1, "barista_role": 1},
                      "evening": {"shift_manager": 1, "barista_role": 1}}
    },

    "constraints": {
        "maxWorkDaysPerWeek": 6,
        "fairnessMaxDiff": 3,
        "forbiddenShiftSequences": [
            {"from": "evening", "to": "morning", "sameNextDay": True}
        ]
    }
}

# עובדים: 2 מנהלים + 4 בריסטות/קופאים
EMPLOYEES = [
    {
        "_id": 101,
        "name": "אלון כהן",
        "password": "pass101",
        "organizationId": "org_cafe_001",
        "isManager": True,
        "qualifications": ["barista", "cashier_cert", "food_handler"],
        "eligibleRoles": ["shift_manager", "barista_role", "cashier_role"],
        "selectedDays": [
            {"day": "Sunday",    "shifts": ["morning", "evening"]},
            {"day": "Monday",    "shifts": ["morning"]},
            {"day": "Tuesday",   "shifts": ["morning", "evening"]},
            {"day": "Wednesday", "shifts": ["morning"]},
            {"day": "Thursday",  "shifts": ["morning", "evening"]},
            {"day": "Friday",    "shifts": ["morning"]},
        ]
    },
    {
        "_id": 102,
        "name": "מיה לוי",
        "password": "pass102",
        "organizationId": "org_cafe_001",
        "isManager": True,
        "qualifications": ["cashier_cert", "food_handler"],
        "eligibleRoles": ["shift_manager", "cashier_role"],
        "selectedDays": [
            {"day": "Monday",    "shifts": ["evening"]},
            {"day": "Tuesday",   "shifts": ["morning"]},
            {"day": "Wednesday", "shifts": ["evening"]},
            {"day": "Thursday",  "shifts": ["morning"]},
            {"day": "Friday",    "shifts": ["morning", "evening"]},
            {"day": "Saturday",  "shifts": ["morning", "evening"]},
        ]
    },
    {
        "_id": 103,
        "name": "דנה רוזן",
        "password": "pass103",
        "organizationId": "org_cafe_001",
        "isManager": False,
        "qualifications": ["barista", "food_handler"],
        "eligibleRoles": ["barista_role"],
        "selectedDays": [
            {"day": "Sunday",    "shifts": ["morning"]},
            {"day": "Monday",    "shifts": ["morning", "evening"]},
            {"day": "Tuesday",   "shifts": ["evening"]},
            {"day": "Wednesday", "shifts": ["morning", "evening"]},
            {"day": "Thursday",  "shifts": ["morning"]},
            {"day": "Saturday",  "shifts": ["morning"]},
        ]
    },
    {
        "_id": 104,
        "name": "יוסי ביטון",
        "password": "pass104",
        "organizationId": "org_cafe_001",
        "isManager": False,
        "qualifications": ["barista", "cashier_cert"],
        "eligibleRoles": ["barista_role", "cashier_role"],
        "selectedDays": [
            {"day": "Sunday",    "shifts": ["evening"]},
            {"day": "Monday",    "shifts": ["morning"]},
            {"day": "Tuesday",   "shifts": ["morning", "evening"]},
            {"day": "Wednesday", "shifts": ["morning"]},
            {"day": "Friday",    "shifts": ["morning", "evening"]},
            {"day": "Saturday",  "shifts": ["evening"]},
        ]
    },
    {
        "_id": 105,
        "name": "שירה אברהם",
        "password": "pass105",
        "organizationId": "org_cafe_001",
        "isManager": False,
        "qualifications": ["cashier_cert", "food_handler"],
        "eligibleRoles": ["cashier_role"],
        "selectedDays": [
            {"day": "Sunday",    "shifts": ["morning", "evening"]},
            {"day": "Tuesday",   "shifts": ["morning"]},
            {"day": "Wednesday", "shifts": ["evening"]},
            {"day": "Thursday",  "shifts": ["morning", "evening"]},
            {"day": "Friday",    "shifts": ["morning"]},
            {"day": "Saturday",  "shifts": ["morning", "evening"]},
        ]
    },
    {
        "_id": 106,
        "name": "תום גולן",
        "password": "pass106",
        "organizationId": "org_cafe_001",
        "isManager": False,
        "qualifications": ["barista"],
        "eligibleRoles": ["barista_role"],
        "selectedDays": [
            {"day": "Sunday",    "shifts": ["morning", "evening"]},
            {"day": "Monday",    "shifts": ["evening"]},
            {"day": "Wednesday", "shifts": ["morning", "evening"]},
            {"day": "Thursday",  "shifts": ["evening"]},
            {"day": "Friday",    "shifts": ["morning", "evening"]},
            {"day": "Saturday",  "shifts": ["morning", "evening"]},
        ]
    },
]


def seed(drop_existing=False):
    MONGO_URI = os.environ.get("MONGO_URI")
    if not MONGO_URI:
        logger.error("Missing MONGO_URI. Create a .env file with MONGO_URI=<your atlas uri>")
        sys.exit(1)

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ismaster")
        db = client["safeshift"]
        logger.info("Connected to MongoDB.")
    except ConnectionFailure as e:
        logger.error(f"Cannot connect to MongoDB: {e}")
        sys.exit(1)

    if drop_existing:
        db["organizations"].delete_many({"_id": "org_cafe_001"})
        db["employees"].delete_many({"organizationId": "org_cafe_001"})
        logger.info("Dropped existing seed data.")

    # Insert organization
    result = db["organizations"].replace_one({"_id": "org_cafe_001"}, ORGANIZATION, upsert=True)
    logger.info(f"Organization upserted: {ORGANIZATION['name']}")

    # Insert employees
    for emp in EMPLOYEES:
        db["employees"].replace_one({"_id": emp["_id"]}, emp, upsert=True)
    logger.info(f"Inserted/updated {len(EMPLOYEES)} employees.")

    logger.info("Seed complete. DB: safeshift, collections: organizations, employees")
    client.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Seed demo café organization into MongoDB")
    parser.add_argument("--drop", action="store_true", help="Drop existing seed data before inserting")
    args = parser.parse_args()
    seed(drop_existing=args.drop)
