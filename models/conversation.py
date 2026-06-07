"""
models/conversation.py - Conversation model
"""

from datetime import datetime
from models import db


class Conversation(db.Model):
    """Chat conversation model"""

    __tablename__ = "conversations"

    # Primary Key
    id = db.Column(db.Integer, primary_key=True)

    # Foreign Key
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )

    # Conversation Info
    title = db.Column(db.String(200), nullable=False, default="New Chat")

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Organization
    is_pinned = db.Column(db.Boolean, default=False, nullable=False)
    is_archived = db.Column(db.Boolean, default=False, nullable=False)

    # Relationships
    messages = db.relationship(
        "Message",
        backref="conversation",
        lazy="dynamic",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )

    def __repr__(self):
        return f"<Conversation {self.id}: {self.title}>"

    def update_timestamp(self):
        """Update the updated_at timestamp"""
        self.updated_at = datetime.utcnow()
        db.session.commit()

    def get_message_count(self):
        """Get total number of messages in conversation"""
        return self.messages.count()

    def get_last_message(self):
        """Get the most recent message"""
        return self.messages.order_by(db.desc("created_at")).first()

    def get_preview(self, max_length=100):
        """Get a preview of the last message"""
        last_msg = self.get_last_message()
        if not last_msg:
            return "No messages yet"

        content = last_msg.content
        if len(content) > max_length:
            return content[:max_length] + "..."
        return content

    def to_dict(self, include_messages=False):
        """Convert conversation to dictionary"""
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "created_at": self.created_at.isoformat() + "Z",
            "updated_at": self.updated_at.isoformat() + "Z",
            "is_pinned": self.is_pinned,
            "is_archived": self.is_archived,
            "message_count": self.get_message_count(),
            "preview": self.get_preview(),
        }

        if include_messages:
            data["messages"] = [msg.to_dict() for msg in self.messages.all()]

        return data