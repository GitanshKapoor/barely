import os
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, Integer, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://barely:barelypassword@barely-db:5432/barelydb")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class RunRecord(Base):
    __tablename__ = "runs"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=True)
    goal = Column(Text)
    start_url = Column(String, nullable=True)
    device = Column(String, default="desktop")
    status = Column(String, default="pending")
    success = Column(Boolean, nullable=True)
    failure_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    logs = Column(Text, nullable=True)
    strict_mode = Column(Boolean, default=False)
    use_cache = Column(Boolean, default=False)
    tags = Column(String, nullable=True)
    
    steps = relationship("RunStep", back_populates="run", cascade="all, delete-orphan")

class RunStep(Base):
    __tablename__ = "run_steps"
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("runs.id"))
    step_index = Column(Integer)
    thought = Column(Text, nullable=True)
    description = Column(Text)
    screenshot_base64 = Column(Text, nullable=True)
    
    run = relationship("RunRecord", back_populates="steps")

class CacheRecord(Base):
    __tablename__ = "cache_records"
    hash = Column(String, primary_key=True, index=True)
    payload = Column(Text) # JSON string of the action

def init_db():
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE runs ADD COLUMN IF NOT EXISTS use_cache BOOLEAN DEFAULT FALSE;"))
            conn.commit()
    except Exception:
        pass
