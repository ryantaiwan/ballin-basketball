/**
 * 確認對話框元件
 */
import React from 'react';

export default function ConfirmDialog({ title = '確認', message, hint, confirmText = '確定', cancelText = '取消', onConfirm, onCancel, confirmType = 'danger' }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="confirm-text">{message}</p>
        {hint && <p className="confirm-hint">{hint}</p>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${confirmType === 'danger' ? 'btn-primary' : 'btn-success'}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
