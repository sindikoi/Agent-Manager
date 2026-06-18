# SafeShift

**Final Year Project**  
**Submitted by:** Alon Cohen, Cindy Kaufman  
**Supervisor:** Dr. Gadi Solotorovsky  

## Overview

**SafeShift** is a web-based platform designed to automate the process of scheduling security guard shifts in hotels. Managing security personnel schedules manually is time-consuming and often leads to inefficiencies, including regulatory violations and employee dissatisfaction. This project addresses these challenges by offering a smart scheduling solution.

## Problem Statement

Scheduling hotel security guards is a complex task. It requires balancing:

- Guard availability
- Hotel-specific security requirements
- Legal work constraints in Israel

Today, this process is often done manually, which results in:

- Administrative overload  
- Non-optimal guard allocation  
- Regulatory non-compliance  
- Employee dissatisfaction  

## Project Goals

- Automate the guard scheduling process
- Ensure compliance with labor regulations in Israel
- Improve scheduling efficiency and transparency
- Provide a user-friendly interface for managers and employees

## System Description

SafeShift includes the following components:

- **Smart Scheduling Algorithm**  
  Utilizes the Google OR-Tools `cp_model` (Constraint Programming) in Python. The algorithm considers:
  - Guards' availability  
  - Security requirements per hotel  
  - Legal constraints (Israeli labor laws)  
  It outputs an optimized shift schedule based on all defined constraints.

- **Web Application**  
  Built with:
  - **Frontend**: React.js + React Router  
  - **Backend**: Node.js with Express.js  
  - **Database**: MongoDB  

## Technologies Used

| Layer           | Technology            |
|----------------|------------------------|
| Frontend       | React.js, React Router |
| Backend        | Node.js, Express.js    |
| Database       | MongoDB                |
| Optimization   | Python, Google OR-Tools (cp_model) |


## Features

- Secure user login for hotel managers
- Guard availability input interface
- Constraint-aware automatic shift generator
- Schedule display and modification tools
- Optimized output ensuring fairness and legality

## How to Run the Project

### Backend

1. Navigate to the backend directory  
2. Install dependencies:
