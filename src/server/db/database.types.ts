export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      changelog: {
        Row: {
          created_at: string
          description: string | null
          features: Json | null
          id: string
          release_date: string
          title: string
          version: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          release_date: string
          title: string
          version: string
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          release_date?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          chat_id: string
          ended_at: string | null
          id: string
          message_count: number | null
          mode: string | null
          session_duration_minutes: number | null
          skill_id: string | null
          started_at: string | null
          task_id: string | null
          topic: string | null
          user_id: string
        }
        Insert: {
          chat_id: string
          ended_at?: string | null
          id?: string
          message_count?: number | null
          mode?: string | null
          session_duration_minutes?: number | null
          skill_id?: string | null
          started_at?: string | null
          task_id?: string | null
          topic?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string
          ended_at?: string | null
          id?: string
          message_count?: number | null
          mode?: string | null
          session_duration_minutes?: number | null
          skill_id?: string | null
          started_at?: string | null
          task_id?: string | null
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "learning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string
          id: string
          skill_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          skill_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          skill_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      code_submissions: {
        Row: {
          code: string
          created_at: string
          id: string
          language: string
          output: string | null
          passed_tests: number | null
          question_id: string
          results: Json | null
          runtime_ms: number | null
          status: string | null
          total_tests: number | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          language?: string
          output?: string | null
          passed_tests?: number | null
          question_id: string
          results?: Json | null
          runtime_ms?: number | null
          status?: string | null
          total_tests?: number | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          language?: string
          output?: string | null
          passed_tests?: number | null
          question_id?: string
          results?: Json | null
          runtime_ms?: number | null
          status?: string | null
          total_tests?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_submissions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "coding_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      coding_questions: {
        Row: {
          created_at: string
          description: string
          difficulty: string | null
          id: string
          skill_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          difficulty?: string | null
          id?: string
          skill_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          difficulty?: string | null
          id?: string
          skill_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "coding_questions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number | null
          confidence_score: number | null
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          page_number: number | null
          skill_id: string | null
          user_id: string
        }
        Insert: {
          chunk_index?: number | null
          confidence_score?: number | null
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          page_number?: number | null
          skill_id?: string | null
          user_id: string
        }
        Update: {
          chunk_index?: number | null
          confidence_score?: number | null
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          page_number?: number | null
          skill_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          error_message: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          filename: string
          id: string
          page_count: number | null
          processed: boolean | null
          skill_id: string | null
          status: string
          storage_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          filename: string
          id?: string
          page_count?: number | null
          processed?: boolean | null
          skill_id?: string | null
          status?: string
          storage_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          filename?: string
          id?: string
          page_count?: number | null
          processed?: boolean | null
          skill_id?: string | null
          status?: string
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          status: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      learning_tasks: {
        Row: {
          auto_generated: boolean | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          phase: number
          phase_name: string
          position: number
          prerequisite_task_ids: string[] | null
          priority: string | null
          progress_percentage: number | null
          skill_id: string
          status: string | null
          task_type: string
          title: string
          topic: string | null
          unlocked: boolean | null
          updated_at: string | null
          user_id: string
          verification_criteria: Json | null
          verification_method: string
        }
        Insert: {
          auto_generated?: boolean | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          phase: number
          phase_name: string
          position?: number
          prerequisite_task_ids?: string[] | null
          priority?: string | null
          progress_percentage?: number | null
          skill_id: string
          status?: string | null
          task_type: string
          title: string
          topic?: string | null
          unlocked?: boolean | null
          updated_at?: string | null
          user_id: string
          verification_criteria?: Json | null
          verification_method: string
        }
        Update: {
          auto_generated?: boolean | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          phase?: number
          phase_name?: string
          position?: number
          prerequisite_task_ids?: string[] | null
          priority?: string | null
          progress_percentage?: number | null
          skill_id?: string
          status?: string | null
          task_type?: string
          title?: string
          topic?: string | null
          unlocked?: boolean | null
          updated_at?: string | null
          user_id?: string
          verification_criteria?: Json | null
          verification_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_tasks_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          mode: string | null
          role: string
          sources: Json | null
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          mode?: string | null
          role: string
          sources?: Json | null
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          mode?: string | null
          role?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          id: string
          message: string
          metadata: Json | null
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      progress_metrics: {
        Row: {
          activity_type: string | null
          created_at: string
          id: string
          max_score: number | null
          metadata: Json | null
          score: number | null
          skill_id: string | null
          user_id: string
        }
        Insert: {
          activity_type?: string | null
          created_at?: string
          id?: string
          max_score?: number | null
          metadata?: Json | null
          score?: number | null
          skill_id?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string | null
          created_at?: string
          id?: string
          max_score?: number | null
          metadata?: Json | null
          score?: number | null
          skill_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_metrics_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: number
          created_at: string
          explanation: string | null
          id: string
          is_correct: boolean | null
          options: Json
          position: number | null
          question: string
          quiz_id: string | null
          skill_id: string | null
          user_answer: number | null
        }
        Insert: {
          correct_answer: number
          created_at?: string
          explanation?: string | null
          id?: string
          is_correct?: boolean | null
          options: Json
          position?: number | null
          question: string
          quiz_id?: string | null
          skill_id?: string | null
          user_answer?: number | null
        }
        Update: {
          correct_answer?: number
          created_at?: string
          explanation?: string | null
          id?: string
          is_correct?: boolean | null
          options?: Json
          position?: number | null
          question?: string
          quiz_id?: string | null
          skill_id?: string | null
          user_answer?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          score: number | null
          skill_id: string
          status: string
          total_questions: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          score?: number | null
          skill_id: string
          status?: string
          total_questions?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          score?: number | null
          skill_id?: string
          status?: string
          total_questions?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_technical: boolean | null
          roadmap: string | null
          roadmap_svg: string | null
          title: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_technical?: boolean | null
          roadmap?: string | null
          roadmap_svg?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_technical?: boolean | null
          roadmap?: string | null
          roadmap_svg?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      task_progress_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          max_score: number | null
          metadata: Json | null
          score: number | null
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          max_score?: number | null
          metadata?: Json | null
          score?: number | null
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          max_score?: number | null
          metadata?: Json | null
          score?: number | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_progress_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "learning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          position: number
          priority: string | null
          skill_id: string | null
          source_chat_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          priority?: string | null
          skill_id?: string | null
          source_chat_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          priority?: string | null
          skill_id?: string | null
          source_chat_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_chat_id_fkey"
            columns: ["source_chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      test_cases: {
        Row: {
          expected_output: string
          id: string
          input: string
          is_hidden: boolean
          position: number | null
          question_id: string
        }
        Insert: {
          expected_output: string
          id?: string
          input: string
          is_hidden?: boolean
          position?: number | null
          question_id: string
        }
        Update: {
          expected_output?: string
          id?: string
          input?: string
          is_hidden?: boolean
          position?: number | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_cases_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "coding_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          created_at: string
          feature_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "feature_requests_with_votes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      feature_requests_with_votes: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          status: string | null
          target_date: string | null
          title: string | null
          updated_at: string | null
          user_has_voted: boolean | null
          vote_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      answer_quiz_question: {
        Args: { p_answer: number; p_question_id: string }
        Returns: {
          correct_answer: number
          explanation: string
          is_correct: boolean
          quiz_completed: boolean
          score: number
          total_questions: number
        }[]
      }
      consume_rate_limit: {
        Args: { p_action: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      get_quiz_history: { Args: { p_skill_id: string }; Returns: Json }
      get_unread_notification_count: { Args: never; Returns: number }
      match_chunks: {
        Args: {
          match_count?: number
          min_similarity?: number
          p_skill_id: string
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          filename: string
          id: string
          page_number: number
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
