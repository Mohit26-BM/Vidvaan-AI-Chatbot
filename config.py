"""
config.py - Application configuration
"""

import os
from datetime import timedelta


class Config:
    """Base configuration"""

    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", "sqlite:///chatbot.db"  # Default to SQLite
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False  # Set to True for SQL debugging

    # Session
    SESSION_COOKIE_SECURE = False  # Set True in production with HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)

    # Flask-Login
    REMEMBER_COOKIE_DURATION = timedelta(days=30)
    REMEMBER_COOKIE_SECURE = False  # Set True in production
    REMEMBER_COOKIE_HTTPONLY = True

    # Chat
    MAX_MESSAGE_LENGTH = 2000
    MAX_HISTORY_LENGTH = 6   # last 3 exchanges — keeps context without burning tokens

    # Groq API
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")


class DevelopmentConfig(Config):
    """Development configuration"""

    DEBUG = True
    SQLALCHEMY_ECHO = True


class ProductionConfig(Config):
    """Production configuration"""

    DEBUG = False
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True

    # Render supplies DATABASE_URL as postgres:// — SQLAlchemy needs postgresql://
    _db_url = os.getenv("DATABASE_URL", "sqlite:///chatbot.db")
    SQLALCHEMY_DATABASE_URI = (
        _db_url.replace("postgres://", "postgresql://", 1)
        if _db_url.startswith("postgres://")
        else _db_url
    )


# Configuration dictionary
config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}