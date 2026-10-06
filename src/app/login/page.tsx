import { safeRedirectPath } from '@/utils/safe-redirect'
import LoginForm from './login-form'

interface LoginPageProps {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams

  return (
    <LoginForm
      initialError={error === 'auth' ? 'Sign-in could not be completed. Please try again.' : null}
      redirectTo={safeRedirectPath(next)}
    />
  )
}
