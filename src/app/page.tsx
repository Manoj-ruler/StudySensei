'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { GraduationCap, Sparkles, Target, Code, ArrowRight, LogOut, Brain, Zap, Trophy, Github, Twitter, Linkedin } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white cursor-default">


      {/* Gradient Mesh Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-purple-400 via-pink-300 to-orange-300 rounded-full blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-400 via-purple-300 to-pink-300 rounded-full blur-3xl opacity-25" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gradient-to-br from-purple-200 via-pink-200 to-orange-200 rounded-full blur-3xl opacity-20"></div>
      </div>

      {/* Navigation Bar - Transparent and Integrated */}
      <nav className="relative z-20">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-purple-600" />
            <span className="text-xl font-bold text-gray-900">StudySensei</span>
          </div>

          {user ? (
            <div className="flex items-center gap-6">
              <Link href="#features" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
                Features
              </Link>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-full transition-all duration-300 flex items-center gap-2 text-sm font-medium"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <Link href="#features" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
                Features
              </Link>
              <Link href="/login">
                <button className="group px-6 py-2.5 bg-white/20 backdrop-blur-md text-gray-900 rounded-xl transition-all duration-300 text-sm font-semibold flex items-center gap-2 shadow-xl shadow-purple-500/40 hover:shadow-2xl hover:shadow-purple-500/50 hover:-translate-y-0.5 border border-purple-400/30 hover:border-purple-500/50 hover:bg-white/30">
                  Get Started
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-6">

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center pt-20 pb-16"
        >
          <p className="text-purple-600 font-medium mb-4 tracking-wide">YOUR AI LEARNING COMPANION</p>
          <h1 className="text-7xl md:text-8xl font-bold text-gray-900 mb-6 leading-tight">
            Learn Smarter,<br />
            <span className="italic font-serif">Not Harder</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Create your own personalized learning path. AI will guide you through interactive quizzes and coding challenges tailored to your goals.
          </p>

          {user ? (
            <Link href="/dashboard">
              <button className="group relative px-10 py-4 bg-white/20 backdrop-blur-md text-gray-900 rounded-2xl transition-all duration-300 text-base font-semibold inline-flex items-center gap-3 shadow-2xl shadow-purple-500/50 hover:shadow-[0_20px_60px_-15px_rgba(168,85,247,0.6)] hover:-translate-y-1 border border-purple-400/30 hover:border-purple-500/50 hover:bg-white/30">
                <Sparkles className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                Go to Dashboard
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          ) : (
            <Link href="/login">
              <button className="group relative px-10 py-4 bg-white/20 backdrop-blur-md text-gray-900 rounded-2xl transition-all duration-300 text-base font-semibold inline-flex items-center gap-3 shadow-2xl shadow-purple-500/50 hover:shadow-[0_20px_60px_-15px_rgba(168,85,247,0.6)] hover:-translate-y-1 border border-purple-400/30 hover:border-purple-500/50 hover:bg-white/30">
                <Sparkles className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                Start Learning Now
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          )}
        </motion.div>

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative mb-32"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-400 to-orange-400 rounded-3xl blur-3xl opacity-40 scale-95"></div>

          <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-12 border border-gray-100">
            <h3 className="text-3xl font-bold text-gray-900 mb-8 text-center">How It Works</h3>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-8 w-8 text-purple-600" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">1. Choose Your Skill</h4>
                <p className="text-gray-600">Pick any topic you want to master</p>
              </div>
              <div className="text-center">
                <div className="bg-pink-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-8 w-8 text-pink-600" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">2. AI Guides You</h4>
                <p className="text-gray-600">Get personalized Roadmap</p>
              </div>
              <div className="text-center">
                <div className="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trophy className="h-8 w-8 text-orange-600" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">3. Master It</h4>
                <p className="text-gray-600">Practice with quizzes and challenges</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Features Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="pb-32"
          id="features"
        >
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Everything You Need<br />
              to <span className="italic font-serif">Excel</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              AI-powered tools designed to make learning engaging, effective, and enjoyable.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="group">
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-gray-100 hover:border-purple-200 hover:shadow-xl transition-all duration-300 h-full">
                <div className="bg-purple-100 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Sparkles className="h-7 w-7 text-purple-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">AI Mentor</h3>
                <p className="text-gray-600 leading-relaxed">
                  Your personal AI assistant provides instant feedback, explanations, and guidance tailored to your learning style.
                </p>
              </div>
            </div>

            <div className="group">
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-gray-100 hover:border-purple-200 hover:shadow-xl transition-all duration-300 h-full">
                <div className="bg-pink-100 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Target className="h-7 w-7 text-pink-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Interactive Quizzes</h3>
                <p className="text-gray-600 leading-relaxed">
                  Test your knowledge with adaptive quizzes that adjust difficulty based on your performance and track your progress.
                </p>
              </div>
            </div>

            <div className="group">
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-gray-100 hover:border-purple-200 hover:shadow-xl transition-all duration-300 h-full">
                <div className="bg-orange-100 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Code className="h-7 w-7 text-orange-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Coding Challenges</h3>
                <p className="text-gray-600 leading-relaxed">
                  Practice with real-world coding problems, get instant feedback, and improve your programming skills step by step.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center pb-32"
        >
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-16 border border-purple-100">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Ready to Start Your Learning Journey?
            </h2>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              Join thousands of learners mastering new skills with AI-powered guidance.
            </p>
            {user ? (
              <Link href="/dashboard">
                <button className="group relative px-10 py-4 bg-white/20 backdrop-blur-md text-gray-900 rounded-2xl transition-all duration-300 text-base font-semibold inline-flex items-center gap-3 shadow-2xl shadow-purple-500/50 hover:shadow-[0_20px_60px_-15px_rgba(168,85,247,0.6)] hover:-translate-y-1 border border-purple-400/30 hover:border-purple-500/50 hover:bg-white/30">
                  <Sparkles className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                  Go to Dashboard
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
            ) : (
              <Link href="/login">
                <button className="group relative px-10 py-4 bg-white/20 backdrop-blur-md text-gray-900 rounded-2xl transition-all duration-300 text-base font-semibold inline-flex items-center gap-3 shadow-2xl shadow-purple-500/50 hover:shadow-[0_20px_60px_-15px_rgba(168,85,247,0.6)] hover:-translate-y-1 border border-purple-400/30 hover:border-purple-500/50 hover:bg-white/30">
                  <Sparkles className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                  Get Started Free
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
            )}
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-purple-600" />
              <span className="text-lg font-bold text-gray-900">StudySensei</span>
            </div>
            <p className="text-gray-600 text-sm">© 2025 StudySensei. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
