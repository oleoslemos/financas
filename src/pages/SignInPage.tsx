import { SignIn } from '@clerk/clerk-react'

export function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-3 sm:p-4">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/lsh/resumo"
        forceRedirectUrl="/lsh/resumo"
      />
    </div>
  )
}
