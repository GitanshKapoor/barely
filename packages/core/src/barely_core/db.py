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
    device = Column(String, default="desktop")
    status = Column(String, default="pending")
    success = Column(Boolean, nullable=True)
    failure_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    steps = relationship("RunStep", back_populates="run", cascade="all, delete-orphan")

class RunStep(Base):
    __tablename__ = "run_steps"
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("runs.id"))
    step_index = Column(Integer)
    description = Column(Text)
    screenshot_path = Column(String, nullable=True)
    
    run = relationship("RunRecord", back_populates="steps")

def init_db():
    Base.metadata.create_all(bind=engine)
