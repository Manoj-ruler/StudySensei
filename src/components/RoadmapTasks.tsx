'use client'

import Link from 'next/link'
import { BookOpen, CheckCircle2, Circle, Code2, Hammer, Lightbulb, PencilLine, Target } from 'lucide-react'
import type { RoadmapTaskType } from '@/lib/api/types'

export interface RoadmapTask {
    id: string
    title: string
    description: string | null
    task_type: string
    status: string | null
    phase: number
    phase_name: string
    topic: string | null
    position: number
}

interface RoadmapTasksProps {
    skillId: string
    tasks: RoadmapTask[]
    /** Called when the learner ticks or unticks a task. */
    onToggle: (task: RoadmapTask, done: boolean) => void
}

const TYPE_LABEL: Record<RoadmapTaskType, { label: string; icon: typeof BookOpen; className: string }> = {
    study: { label: 'Study', icon: BookOpen, className: 'bg-blue-50 text-blue-700 border-blue-200' },
    practice: { label: 'Practice', icon: PencilLine, className: 'bg-amber-50 text-amber-700 border-amber-200' },
    quiz: { label: 'Quiz', icon: Target, className: 'bg-orange-50 text-orange-700 border-orange-200' },
    challenge: { label: 'Challenge', icon: Code2, className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    project: { label: 'Project', icon: Hammer, className: 'bg-pink-50 text-pink-700 border-pink-200' },
}

/** Where a task's action button leads: the quiz, the code editor, or the mentor with a prefilled question. */
function taskAction(skillId: string, task: RoadmapTask): { href: string; label: string } {
    if (task.task_type === 'quiz') return { href: `/skills/${skillId}/quiz`, label: 'Take a quiz' }
    if (task.task_type === 'challenge') return { href: `/skills/${skillId}/coding`, label: 'Open editor' }
    const practising = task.task_type === 'practice' || task.task_type === 'project'
    const message = practising
        ? `Coach me through this task: "${task.title}". ${task.description ?? ''}`
        : `Teach me: "${task.title}". ${task.description ?? ''}`
    const params = new URLSearchParams({ mode: practising ? 'coach' : 'explain', message: message.trim() })
    return { href: `/skills/${skillId}?${params}`, label: practising ? 'Get coached' : 'Learn this' }
}

export default function RoadmapTasks({ skillId, tasks, onToggle }: RoadmapTasksProps) {
    const phases = new Map<number, { name: string; tasks: RoadmapTask[] }>()
    for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
        const phase = phases.get(task.phase) ?? { name: task.phase_name, tasks: [] }
        phase.tasks.push(task)
        phases.set(task.phase, phase)
    }

    const doneCount = tasks.filter((task) => task.status === 'done').length
    const overall = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-gray-900">Your progress</h2>
                    <span className="text-sm font-semibold text-purple-700">
                        {doneCount} of {tasks.length} tasks · {overall}%
                    </span>
                </div>
                <div
                    className="h-2.5 bg-gray-100 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={overall}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Roadmap progress"
                >
                    <div
                        className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500"
                        style={{ width: `${overall}%` }}
                    />
                </div>
            </div>

            {[...phases.entries()]
                .sort(([a], [b]) => a - b)
                .map(([number, phase]) => {
                    const phaseDone = phase.tasks.filter((task) => task.status === 'done').length
                    return (
                        <div
                            key={number}
                            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                        >
                            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4">
                                <h3 className="text-xl font-bold text-gray-900">{phase.name}</h3>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className="text-xs font-medium text-gray-500">
                                        {phaseDone}/{phase.tasks.length}
                                    </span>
                                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                                        Phase {number}
                                    </span>
                                </div>
                            </div>

                            <ul className="divide-y divide-gray-100">
                                {phase.tasks.map((task) => {
                                    const done = task.status === 'done'
                                    const type =
                                        TYPE_LABEL[task.task_type as RoadmapTaskType] ?? TYPE_LABEL.study
                                    const TypeIcon = type.icon
                                    const action = taskAction(skillId, task)
                                    return (
                                        <li key={task.id} className="px-6 py-4 flex items-start gap-4">
                                            <button
                                                onClick={() => onToggle(task, !done)}
                                                role="checkbox"
                                                aria-checked={done}
                                                aria-label={`Mark "${task.title}" as ${done ? 'not done' : 'done'}`}
                                                className="mt-0.5 flex-shrink-0 text-purple-600 hover:text-purple-800 transition-colors"
                                            >
                                                {done ? (
                                                    <CheckCircle2 className="h-6 w-6" />
                                                ) : (
                                                    <Circle className="h-6 w-6 text-gray-300 hover:text-purple-400" />
                                                )}
                                            </button>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <span
                                                        className={`font-semibold ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}
                                                    >
                                                        {task.title}
                                                    </span>
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${type.className}`}
                                                    >
                                                        <TypeIcon className="h-3 w-3" />
                                                        {type.label}
                                                    </span>
                                                </div>
                                                {task.description && (
                                                    <p className="text-sm text-gray-600 leading-relaxed">
                                                        {task.description}
                                                    </p>
                                                )}
                                            </div>

                                            <Link
                                                href={action.href}
                                                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                                            >
                                                <Lightbulb className="h-3.5 w-3.5" />
                                                {action.label}
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                })}
        </div>
    )
}
