#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlYjA4ZTdjMi04ZDJmLTRhYzItYmRkNi1hZDQ4ZmI3MDM2YTEiLCJpYXQiOjE3ODIxNDA0MjUsImV4cCI6MTc4OTkxNjQyNX0.kVV9pt4zrBWn3F4llkNCxoUbvP2qq-Kz9EByvYNvVT0"

curl -X POST http://localhost:3000/api/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d @/Users/shubhamlakhera/Desktop/engram/backend/test.json
