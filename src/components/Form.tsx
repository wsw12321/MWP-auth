import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  return <div className="field"><label htmlFor={id}>{label}</label><input {...props} id={id} aria-describedby={hint ? `${id}-hint` : undefined} />{hint && <small id={`${id}-hint`}>{hint}</small>}</div>
}
export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'success' | 'error' }) {
  return children ? <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div> : null
}
export function Loading({ children = '正在载入…' }: { children?: ReactNode }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{children}</div>
}
export function AuthCard({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <section className="auth-card card"><p className="eyebrow">WATER5 ACCOUNT</p><h1>{title}</h1><p className="intro">{intro}</p>{children}</section>
}
