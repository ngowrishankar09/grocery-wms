import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import AuditLog
from security import get_current_user, get_company_id

router = APIRouter(prefix="/audit-log", tags=["audit-log"])

@router.get("")
def list_audit_log(
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    username: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(AuditLog).filter(AuditLog.company_id == company_id)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if action:
        q = q.filter(AuditLog.action == action)
    if username:
        q = q.filter(AuditLog.username.ilike(f"%{username}%"))
    logs = q.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "username": l.username,
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "entity_ref": l.entity_ref,
            "detail": l.detail,
            "created_at": str(l.created_at),
        }
        for l in logs
    ]


def log_action(db: Session, company_id: int, username: str, action: str,
               entity_type: str = None, entity_id: int = None, entity_ref: str = None, detail: str = None):
    """Utility to log an action. Import this in other routers."""
    try:
        entry = AuditLog(
            company_id=company_id, username=username, action=action,
            entity_type=entity_type, entity_id=entity_id, entity_ref=entity_ref, detail=detail,
        )
        db.add(entry)
        db.flush()
    except Exception:
        pass  # audit log failure should never break the main operation
