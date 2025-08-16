"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Trash2, PlusCircle, CalendarDays } from "lucide-react"
import { format } from "date-fns"

interface Task {
  id: number
  text: string
  completed: boolean
  createdAt: string
}

export default function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskText, setTaskText] = useState("")

  const addTask = () => {
    if (!taskText.trim()) return
    setTasks([
      ...tasks,
      { 
        id: Date.now(), 
        text: taskText.trim(), 
        completed: false, 
        createdAt: format(new Date(), "MMM dd, yyyy")
      }
    ])
    setTaskText("")
  }

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
  }

  const deleteTask = (id: number) => {
    setTasks(tasks.filter(t => t.id !== id))
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100">
      <Card className="w-full max-w-lg shadow-2xl rounded-2xl border border-gray-200 bg-white/90 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            📋 My Daily Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Input area */}
          <div className="flex gap-2 mb-6">
            <Input
              placeholder="Add a new task..."
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              className="rounded-xl"
            />
            <Button onClick={addTask} className="gap-1 rounded-xl shadow-md">
              <PlusCircle className="w-4 h-4" /> Add
            </Button>
          </div>

          {/* Tasks */}
          <div className="space-y-4">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p className="italic">No tasks yet — add one and get productive! 🚀</p>
              </div>
            ) : (
              tasks.map(task => (
                <div
                  key={task.id}
                  className="relative bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 shadow hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={() => toggleTask(task.id)}
                        className="mt-1"
                      />
                      <div>
                        <span className={`block font-medium ${task.completed ? "line-through text-gray-400" : "text-gray-800"}`}>
                          {task.text}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                          <CalendarDays className="w-3 h-3" />
                          {task.createdAt}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
