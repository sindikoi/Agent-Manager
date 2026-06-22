# SafeShift — single-service image.
# Node serves the API + the built React client, and spawns the Python
# OR-Tools solver. One container, one URL.
FROM node:20-bookworm

# --- Python (for the OR-Tools scheduler) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps in an isolated venv (avoids Debian's PEP 668 restriction).
COPY Python/requirements.txt ./Python/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r Python/requirements.txt
# The server reads process.env.PYTHON_BIN to know which interpreter to spawn.
ENV PYTHON_BIN=/opt/venv/bin/python

# --- Node server deps ---
COPY Server/package.json ./Server/package.json
RUN cd Server && npm install --omit=dev

# --- Build the React client ---
COPY Client/package.json ./Client/package.json
RUN cd Client && npm install
COPY Client ./Client
RUN cd Client && npm run build

# --- App source ---
COPY Server ./Server
COPY Python ./Python

ENV NODE_ENV=production
# Render injects PORT; the server falls back to 3002 locally.
EXPOSE 3002
CMD ["node", "Server/server.js"]
