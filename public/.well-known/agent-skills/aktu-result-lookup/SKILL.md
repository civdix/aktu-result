---
name: aktu-result-lookup
description: Query and verify AKTU student examination results and marksheet records by roll number.
---

# AKTU Result Lookup Skill

This skill allows AI agents to programmatically query examination results and marksheet records for students of Dr. A.P.J. Abdul Kalam Technical University (AKTU).

## Endpoints

### 1. Result Query

- **URL**: `POST https://akturesult.bond/api/search`
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "rollNumber": "2400650100001"
  }
  ```
- **Response**: JSON containing student details, semester marks, SGPA, CGPA, and pass/fail status.

### 2. Colleges & Branches Directory

- **URL**: `GET https://akturesult.bond/api/colleges`
- **Description**: Returns all affiliated colleges with college codes and slugs.
