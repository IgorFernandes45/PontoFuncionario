export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          company_id: string
          created_at: string
          id: string
          meta: Json | null
          target: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          company_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          target?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          company_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          name: string
          plan: string
          timezone: string
          trial_ends_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          name: string
          plan?: string
          timezone?: string
          trial_ends_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          name?: string
          plan?: string
          timezone?: string
          trial_ends_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          full_name: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      location_wifi: {
        Row: {
          bssid: string | null
          created_at: string
          id: string
          location_id: string
          ssid: string
        }
        Insert: {
          bssid?: string | null
          created_at?: string
          id?: string
          location_id: string
          ssid: string
        }
        Update: {
          bssid?: string | null
          created_at?: string
          id?: string
          location_id?: string
          ssid?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_wifi_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          method: Database["public"]["Enums"]["punch_method"]
          name: string
          radius_m: number
          require_selfie: boolean
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          method?: Database["public"]["Enums"]["punch_method"]
          name: string
          radius_m?: number
          require_selfie?: boolean
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          method?: Database["public"]["Enums"]["punch_method"]
          name?: string
          radius_m?: number
          require_selfie?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          full_name: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          active: boolean
          break_minutes: number
          color: string
          company_id: string
          created_at: string
          end_time: string
          id: string
          key: string
          label: string
          start_time: string
        }
        Insert: {
          active?: boolean
          break_minutes?: number
          color?: string
          company_id: string
          created_at?: string
          end_time: string
          id?: string
          key: string
          label: string
          start_time: string
        }
        Update: {
          active?: boolean
          break_minutes?: number
          color?: string
          company_id?: string
          created_at?: string
          end_time?: string
          id?: string
          key?: string
          label?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      auth_company_ids: { Args: never; Returns: string[] }
      auth_membership_ids: { Args: never; Returns: string[] }
      auth_role: {
        Args: { cid: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      can_manage_member: {
        Args: {
          p_company_id: string
          p_target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      company_members: {
        Args: { p_company_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          membership_id: string
          role: Database["public"]["Enums"]["app_role"]
          sou_eu: boolean
          status: Database["public"]["Enums"]["member_status"]
        }[]
      }
      create_company_with_owner: {
        Args: {
          p_cnpj?: string
          p_full_name: string
          p_name: string
          p_timezone?: string
        }
        Returns: string
      }
      expire_stale_invitations: {
        Args: { p_company_id: string }
        Returns: number
      }
      invitation_preview: {
        Args: { p_token: string }
        Returns: {
          company_name: string
          email: string
          expirado: boolean
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }[]
      }
      member_has_history: {
        Args: { p_membership_id: string }
        Returns: boolean
      }
      my_pending_invitations: {
        Args: never
        Returns: {
          company_name: string
          expires_at: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }[]
      }
      my_workspaces: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          full_name: string
          membership_id: string
          plan: string
          role: Database["public"]["Enums"]["app_role"]
          timezone: string
          trial_ends_at: string
        }[]
      }
      remove_member: { Args: { p_membership_id: string }; Returns: undefined }
      seed_default_shifts: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      set_member_role: {
        Args: {
          p_membership_id: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      set_member_status: {
        Args: {
          p_membership_id: string
          p_status: Database["public"]["Enums"]["member_status"]
        }
        Returns: undefined
      }
      shift_duration_minutes: {
        Args: { p_end: string; p_start: string }
        Returns: number
      }
      update_company: {
        Args: {
          p_cnpj?: string
          p_company_id: string
          p_name: string
          p_timezone: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "dono" | "gerente" | "funcionario"
      member_status: "ativo" | "pendente" | "inativo"
      punch_method: "gps" | "wifi" | "ambos"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["dono", "gerente", "funcionario"],
      member_status: ["ativo", "pendente", "inativo"],
      punch_method: ["gps", "wifi", "ambos"],
    },
  },
} as const

