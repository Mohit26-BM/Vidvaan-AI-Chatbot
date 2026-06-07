"""
models/__init__.py - Database initialization
"""

from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

# Initialize extensions
db = SQLAlchemy()
login_manager = LoginManager()

# Configure login manager
login_manager.login_view = "login_page"
login_manager.login_message = "Please log in to access this page."
login_manager.login_message_category = "info"


def init_db(app):
    """Initialize database with Flask app"""
    db.init_app(app)
    login_manager.init_app(app)

    # Import models here to avoid circular imports
    from models.user import User
    from models.conversation import Conversation
    from models.message import Message

    # User loader for Flask-Login
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Add new columns to existing SQLite databases without wiping data
    with app.app_context():
        db.create_all()
        _migrate_sqlite(db)

    return db


def _migrate_sqlite(db):
    """Add any missing columns to existing SQLite databases."""
    try:
        db.session.execute(db.text("ALTER TABLE users ADD COLUMN custom_instructions TEXT"))
        db.session.commit()
    except Exception:
        db.session.rollback()
