# Security Fix - MongoDB Credentials

## What changed

The MongoDB Atlas connection string (including username + password) was
previously **hardcoded directly in source code** in two files:

- `Server/server.js`
- `Python/MongoConnection.py`

This is a serious security issue, especially since this repository is on
GitHub. Both files now read the connection string from an environment
variable `MONGO_URI` instead.

## What you need to do before running the project

1. **Get your own MongoDB Atlas database user.**
   The old credentials (`alon123179`) belonged to a former project partner
   who is no longer involved. Do not rely on them.

   - If you have access to the Atlas project: go to
     *Database Access* -> *Add New Database User* and create a user with a
     username/password of your choosing.
   - If you don't have access: ask whoever owns the Atlas project to either
     add you as a collaborator, or create a new database user for you.
   - Optionally, once you have your own credentials working, ask the owner
     to remove/rotate the old `alon123179` user.

2. **Create your `.env` files** (these are git-ignored, never commit them):

   - `Server/.env` - copy from `Server/.env.example` and fill in `MONGO_URI`
     with your real connection string.
   - `Python/.env` - copy from `Python/.env.example` and fill in the same
     `MONGO_URI`.

3. **Install dependencies**

   - Server: `cd Server && npm install`
   - Python: `cd Python && pip install -r requirements.txt`

## Why this matters

Anyone who can see this GitHub repository (including its full commit
history) could previously read the database password and connect directly
to the database. Even after this fix, the **old password is still exposed in
the git history** of this repo. Rotating/changing that database user's
password in Atlas is the only way to fully close that exposure - removing it
from the current code is necessary but not sufficient.
