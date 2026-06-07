"""
models/message.py - Message model
"""

from datetime import datetime
from models import db


class Message(db.Model):
    """Chat message model"""

    __tablename__ = "messages"

    # Primary Key
    id = db.Column(db.Integer, primary_key=True)

    # Foreign Key
    conversation_id = db.Column(
        db.Integer, db.ForeignKey("conversations.id"), nullable=False, index=True
    )

    # Message Content
    role = db.Column(db.String(20), nullable=False)  # 'user', 'assistant', or 'system'

    content = db.Column(db.Text, nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Optional: Token count for analytics
    token_count = db.Column(db.Integer, nullable=True)

    def __repr__(self):
        return f"<Message {self.id}: {self.role}>"

    def to_dict(self):
        """Convert message to dictionary"""
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
            "token_count": self.token_count,
        }

    def to_groq_format(self):
        """Convert to format expected by Groq API"""
        return {"role": self.role, "content": self.content}

    @staticmethod
    def create_message(conversation_id, role, content, token_count=None):
        """Factory method to create a new message"""
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            token_count=token_count,
        )
        db.session.add(message)
        db.session.commit()
        return message
