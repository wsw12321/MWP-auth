import { Fragment, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { authPath, safeNext } from './lib/navigation'
import { configError } from './lib/config'
import Layout from './components/Layout'
import { AuthCard, Loading } from './components/Form'
import { Login, Register, ForgotPassword } from './pages/AuthForms'
import Callback from './pages/Callback'
import ResetPassword from './pages/ResetPassword'
const Account = lazy(() => import('./pages/Account'))
const Apps = lazy(() => import('./pages/Apps'))
const Sites = lazy(() => import('./pages/Sites'))
const Consent = lazy(() => import('./pages/Consent'))

function SignedOut({ children }: { children: ReactNode }) {
  const { user, recovery } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  if (recovery) return <Navigate replace to={authPath('/reset-password', next)} />
  return user ? <Navigate replace to={next} /> : children
}
function Protected({ children }: { children: ReactNode }) {
  const { user, recovery } = useAuth()
  const location = useLocation()
  const next = safeNext(location.pathname + location.search)
  if (recovery) return <Navigate replace to={authPath('/reset-password', next)} />
  return user ? <Fragment key={user.id}>{children}</Fragment> : <Navigate replace to={authPath('/login', next)} />
}
function Home() {
  const { user, recovery } = useAuth()
  return <Navigate replace to={recovery ? '/reset-password' : user ? '/account' : '/login'} />
}
export default function App() {
  const { loading } = useAuth()
  return <Layout>{configError ? <AuthCard title="账号中心尚未配置" intro="请完成站点配置后再使用。"><div className="notice error" role="alert">{configError}</div></AuthCard>
    : loading ? <Loading>正在恢复登录状态…</Loading>
      : <Suspense fallback={<Loading>正在加载页面…</Loading>}><Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<SignedOut><Login /></SignedOut>} />
        <Route path="/register" element={<SignedOut><Register /></SignedOut>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/callback" element={<Callback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/account" element={<Protected><Account /></Protected>} />
        <Route path="/account/apps" element={<Protected><Apps /></Protected>} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/oauth/consent" element={<Protected><Consent /></Protected>} />
        <Route path="*" element={<AuthCard title="页面未找到" intro="这条水路还未开通。"><Link className="button" to="/">返回账号中心</Link></AuthCard>} />
      </Routes></Suspense>}</Layout>
}
