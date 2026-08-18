// Enrollment audit trail. Every auditable event lands in status_history —
// the table predates the general log, so status changes keep using
// old_status/new_status while other events carry an action + human detail.
export const AUDIT_ACTIONS = {
  CREATED: 'created',
  STATUS_CHANGE: 'status_change',
  QUALIFICATION: 'qualification',
  NOTE_EDITED: 'note_edited',
  DELETED: 'deleted',
};

// `client` may be a transaction client or the pooled query helper.
export function logAudit(client, { enrollmentId, action, oldStatus = null, newStatus = null, detail = null, userId = null }) {
  return client.query(
    `INSERT INTO status_history (enrollment_id, action, old_status, new_status, detail, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [enrollmentId, action, oldStatus, newStatus, detail, userId],
  );
}
