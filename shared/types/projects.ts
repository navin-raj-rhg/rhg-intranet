import type { ProjectTaskStatus } from '../utils/projectRules'

/** What the Projects API returns (shared by the server routes and the screens). */

export type ProjectStatus = 'open' | 'closed'

export interface ProjectsMyRoleResponse {
  roles: string[]
  isAdmin: boolean
  canCreate: boolean
}

export interface ProjectPerson {
  id: string
  name: string
}

export interface ProjectTypeItem {
  id: number
  name: string
  active: boolean
}

export interface ProjectSectionItem {
  id: number
  name: string
  active: boolean
}

/** One master-list task, as the admin screen edits it. `key` is String(id) for saved tasks. */
export interface ProjectTemplateTaskItem {
  key: string
  title: string
  description: string | null
  sectionId: number | null
  assigneeId: string | null
  leadTimeDays: number
  active: boolean
  typeIds: number[]
  dependsOn: string[]
}

export interface ProjectTemplateResponse {
  types: ProjectTypeItem[]
  sections: ProjectSectionItem[]
  tasks: ProjectTemplateTaskItem[]
}

export interface ProjectListItem {
  id: number
  name: string
  status: ProjectStatus
  typeName: string | null
  startDate: string
  targetDate: string | null
  ownerName: string
  openTasks: number
  doneTasks: number
  overdueTasks: number
  atRisk: boolean
}

export interface ProjectTaskItem {
  id: number
  title: string
  description: string | null
  /** Null = no section. Tasks come back already grouped in section order. */
  section: string | null
  assigneeId: string | null
  assigneeName: string | null
  status: ProjectTaskStatus
  /** True while any task it waits for isn't Done. */
  blocked: boolean
  leadTimeDays: number
  dueDate: string | null
  overdue: boolean
  dependsOn: number[]
  completedAt: string | null
  commentCount: number
  fileCount: number
}

export interface ProjectView {
  id: number
  name: string
  status: ProjectStatus
  typeName: string | null
  startDate: string
  targetDate: string | null
  products: string | null
  notes: string | null
  ownerId: string
  ownerName: string
  atRisk: boolean
  members: ProjectPerson[]
  tasks: ProjectTaskItem[]
  /** What the signed-in person may do here (the API enforces the same rules). */
  canManage: boolean
}

export interface ProjectCommentItem {
  id: number
  authorName: string
  body: string
  createdAt: string
}

export interface ProjectFileItem {
  id: number
  fileName: string
  sizeBytes: number
  uploadedByName: string
  createdAt: string
  /** Whether the signed-in person may remove it. */
  canRemove: boolean
}

/** The result of changing a task's status. */
export interface ProjectTaskStatusResponse {
  /** Titles of tasks that just unlocked and were given a due date. */
  unlocked: string[]
  /** Titles of tasks put back to Blocked because a task they wait for was reopened. */
  reblocked: string[]
  /** Titles of tasks already in progress or done that depend on a reopened task. */
  warn: string[]
}

export interface ProjectMyTaskItem {
  id: number
  title: string
  projectId: number
  projectName: string
  dueDate: string | null
  overdue: boolean
  status: ProjectTaskStatus
}
