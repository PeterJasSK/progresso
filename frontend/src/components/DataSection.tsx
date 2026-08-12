// "Your data" (P8 §5.8, AC-9): export the caller's own data as a JSON download,
// or permanently delete the account behind a typed confirmation. Self-service,
// any role. Delete is destructive + irreversible — hence the typed guard. All
// copy via i18n. Shown on the trainee and trainer home screens.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from './Card'
import { Button } from './Button'
import { Input } from './Input'
import { useAuth } from '../auth/useAuth'
import { deleteAccount, exportData } from '../lib/me'

export function DataSection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  // The literal a user must type to confirm deletion (localized per catalog).
  const confirmWord = t('data.deleteConfirmWord')

  async function handleExport() {
    setError(false)
    try {
      const data = await exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `progresso-${user?.username ?? 'export'}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setError(true)
    }
  }

  async function handleDelete() {
    if (confirmText.trim() !== confirmWord || busy) return
    setBusy(true)
    setError(false)
    try {
      await deleteAccount()
      // The session is already cleared server-side; a hard navigation re-boots
      // the SPA so no stale auth state survives.
      window.location.assign('/login')
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="mb-2 font-display text-lg font-bold text-heading">
        {t('data.title')}
      </h2>
      <p className="mb-3 font-sans text-sm text-muted">{t('data.description')}</p>

      {error && (
        <p className="mb-3 font-sans text-sm text-danger">{t('errors.unknown')}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={handleExport}>
          {t('data.export')}
        </Button>
        {!confirming && (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            {t('data.delete')}
          </Button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 rounded-md border border-danger p-3">
          <p className="mb-2 font-sans text-sm font-medium text-danger">
            {t('data.deleteWarning')}
          </p>
          <p className="mb-2 font-sans text-sm text-muted">
            {t('data.deletePrompt', { word: confirmWord })}
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={confirmWord}
            className="mb-2"
            aria-label={t('data.deletePrompt', { word: confirmWord })}
          />
          <div className="flex gap-2">
            <Button
              onClick={handleDelete}
              disabled={busy || confirmText.trim() !== confirmWord}
            >
              {t('data.deleteConfirm')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false)
                setConfirmText('')
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
