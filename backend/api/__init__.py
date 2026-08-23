"""FastAPI REST layer for the campus project.

Shares the same PostgreSQL database (Cloud SQL) with Django. The schema is owned by Django
migrations; SQLAlchemy here only maps and queries the existing tables.
"""
