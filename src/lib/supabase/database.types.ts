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
      absences: {
        Row: {
          attachment_path: string | null
          company_id: string
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          kind: Database["public"]["Enums"]["absence_kind"]
          membership_id: string | null
          note: string | null
          starts_on: string
        }
        Insert: {
          attachment_path?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          kind: Database["public"]["Enums"]["absence_kind"]
          membership_id?: string | null
          note?: string | null
          starts_on: string
        }
        Update: {
          attachment_path?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["absence_kind"]
          membership_id?: string | null
          note?: string | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
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
          late_tolerance_minutes: number
          name: string
          plan: string
          timezone: string
          trial_ends_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          late_tolerance_minutes?: number
          name: string
          plan?: string
          timezone?: string
          trial_ends_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          late_tolerance_minutes?: number
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
      outbox: {
        Row: {
          assunto: string
          company_id: string
          corpo: string
          created_at: string
          enviado_em: string | null
          erro: string | null
          id: string
          para_email: string
          status: Database["public"]["Enums"]["outbox_status"]
          tentativas: number
        }
        Insert: {
          assunto: string
          company_id: string
          corpo: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          para_email: string
          status?: Database["public"]["Enums"]["outbox_status"]
          tentativas?: number
        }
        Update: {
          assunto?: string
          company_id?: string
          corpo?: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          para_email?: string
          status?: Database["public"]["Enums"]["outbox_status"]
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_requests: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          kind: Database["public"]["Enums"]["request_kind"]
          membership_id: string
          punch_id: string | null
          reason: string
          requested_at: string | null
          requested_type: Database["public"]["Enums"]["punch_type"] | null
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          kind: Database["public"]["Enums"]["request_kind"]
          membership_id: string
          punch_id?: string | null
          reason: string
          requested_at?: string | null
          requested_type?: Database["public"]["Enums"]["punch_type"] | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["request_kind"]
          membership_id?: string
          punch_id?: string | null
          reason?: string
          requested_at?: string | null
          requested_type?: Database["public"]["Enums"]["punch_type"] | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "punch_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_requests_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_requests_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
        ]
      }
      punches: {
        Row: {
          accuracy_m: number | null
          company_id: string
          created_at: string
          created_by: string | null
          distance_m: number | null
          id: string
          justification: string | null
          lat: number | null
          lng: number | null
          location_id: string | null
          membership_id: string
          origin: Database["public"]["Enums"]["punch_origin"]
          punched_at: string
          replaces_punch_id: string | null
          selfie_path: string | null
          sincronizado_em: string | null
          type: Database["public"]["Enums"]["punch_type"]
          verified: boolean
          verify_method: Database["public"]["Enums"]["punch_method"] | null
          voided: boolean
          wifi_ssid: string | null
          work_date: string
        }
        Insert: {
          accuracy_m?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          distance_m?: number | null
          id?: string
          justification?: string | null
          lat?: number | null
          lng?: number | null
          location_id?: string | null
          membership_id: string
          origin?: Database["public"]["Enums"]["punch_origin"]
          punched_at: string
          replaces_punch_id?: string | null
          selfie_path?: string | null
          sincronizado_em?: string | null
          type: Database["public"]["Enums"]["punch_type"]
          verified?: boolean
          verify_method?: Database["public"]["Enums"]["punch_method"] | null
          voided?: boolean
          wifi_ssid?: string | null
          work_date: string
        }
        Update: {
          accuracy_m?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          distance_m?: number | null
          id?: string
          justification?: string | null
          lat?: number | null
          lng?: number | null
          location_id?: string | null
          membership_id?: string
          origin?: Database["public"]["Enums"]["punch_origin"]
          punched_at?: string
          replaces_punch_id?: string | null
          selfie_path?: string | null
          sincronizado_em?: string | null
          type?: Database["public"]["Enums"]["punch_type"]
          verified?: boolean
          verify_method?: Database["public"]["Enums"]["punch_method"] | null
          voided?: boolean
          wifi_ssid?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "punches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_replaces_punch_id_fkey"
            columns: ["replaces_punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_events: {
        Row: {
          chave: string
          created_at: string
          id: number
        }
        Insert: {
          chave: string
          created_at?: string
          id?: number
        }
        Update: {
          chave?: string
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      schedule_entries: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string | null
          membership_id: string
          shift_key: string | null
          weekday: number | null
          work_date: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          membership_id: string
          shift_key?: string | null
          weekday?: number | null
          work_date?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          membership_id?: string
          shift_key?: string | null
          weekday?: number | null
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_shift_fk"
            columns: ["company_id", "shift_key"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["company_id", "key"]
          },
          {
            foreignKeyName: "schedule_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
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
      absences_in_range: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          absence_id: string
          da_empresa: boolean
          dia: string
          full_name: string
          kind: Database["public"]["Enums"]["absence_kind"]
          membership_id: string
          note: string
        }[]
      }
      accept_invitation: { Args: { p_token: string }; Returns: string }
      add_missing_punch: {
        Args: {
          p_justification: string
          p_membership_id: string
          p_punched_at: string
          p_type: Database["public"]["Enums"]["punch_type"]
        }
        Returns: string
      }
      adjust_punch: {
        Args: {
          p_justification: string
          p_punch_id: string
          p_punched_at: string
        }
        Returns: string
      }
      allowed_punch_types: {
        Args: { p_membership_id: string; p_work_date: string }
        Returns: Database["public"]["Enums"]["punch_type"][]
      }
      auth_company_ids: { Args: never; Returns: string[] }
      auth_membership_ids: { Args: never; Returns: string[] }
      auth_role: {
        Args: { cid: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      bulk_invite: {
        Args: { p_company_id: string; p_pessoas: Json }
        Returns: {
          email: string
          resultado: string
        }[]
      }
      can_manage_member: {
        Args: {
          p_company_id: string
          p_target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_chave: string; p_janela_s: number; p_max: number }
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
      copy_week: {
        Args: { p_company_id: string; p_destino: string; p_origem: string }
        Returns: number
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
      daily_report: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          atraso_min: number
          ausencia_tipo: Database["public"]["Enums"]["absence_kind"]
          dia: string
          entrada_prevista: string
          entrada_real: string
          full_name: string
          intervalo_min: number
          intervalo_presumido: boolean
          membership_id: string
          previsto_min: number
          saida_real: string
          shift_label: string
          situacao: Database["public"]["Enums"]["day_status"]
          tem_ajuste: boolean
          trabalhado_min: number
          turno_aberto: boolean
        }[]
      }
      day_sequence_is_valid: {
        Args: { p_membership_id: string; p_work_date: string }
        Returns: boolean
      }
      decide_punch_request: {
        Args: { p_aprovar: boolean; p_nota?: string; p_request_id: string }
        Returns: string
      }
      delete_company: {
        Args: { p_company_id: string; p_confirmacao: string }
        Returns: undefined
      }
      effective_punches: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          accuracy_m: number
          atrasado: boolean
          distance_m: number
          full_name: string
          id: string
          membership_id: string
          origin: Database["public"]["Enums"]["punch_origin"]
          punched_at: string
          selfie_path: string
          type: Database["public"]["Enums"]["punch_type"]
          work_date: string
        }[]
      }
      expire_stale_invitations: {
        Args: { p_company_id: string }
        Returns: number
      }
      export_company_data: { Args: { p_company_id: string }; Returns: Json }
      haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
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
      last_punch_of_day: {
        Args: { p_membership_id: string; p_work_date: string }
        Returns: Database["public"]["Enums"]["punch_type"]
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
      my_punch_state: {
        Args: { p_company_id: string }
        Returns: {
          location_lat: number
          location_lng: number
          location_name: string
          membership_id: string
          permitidos: Database["public"]["Enums"]["punch_type"][]
          radius_m: number
          require_selfie: boolean
          ultimo_em: string
          ultimo_tipo: Database["public"]["Enums"]["punch_type"]
          work_date: string
        }[]
      }
      my_schedule_updated_at: { Args: never; Returns: string }
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
      operation_health: {
        Args: { p_company_id: string }
        Returns: {
          avisos_na_fila: number
          faltas_ontem: number
          pedidos_pendentes: number
          sem_escala_hoje: number
          turnos_abertos_ontem: number
        }[]
      }
      period_report: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          atraso_total_min: number
          atrasos: number
          ausencias: number
          dias_com_ajuste: number
          dias_em_aberto: number
          dias_previstos: number
          dias_trabalhados: number
          faltas: number
          full_name: string
          membership_id: string
          previsto_min: number
          saldo_min: number
          trabalhado_min: number
        }[]
      }
      punch_history: {
        Args: { p_punch_id: string }
        Returns: {
          autor: string
          efetivo: boolean
          id: string
          justification: string
          origin: Database["public"]["Enums"]["punch_origin"]
          punched_at: string
          registrado_em: string
          type: Database["public"]["Enums"]["punch_type"]
          voided: boolean
        }[]
      }
      punch_work_date: {
        Args: { p_membership_id: string; p_quando: string; p_timezone: string }
        Returns: string
      }
      queue_schedule_notices: {
        Args: { p_company_id: string; p_desde?: string }
        Returns: number
      }
      register_punch: {
        Args: {
          p_accuracy_m?: number
          p_lat?: number
          p_lng?: number
          p_membership_id: string
          p_punched_at?: string
          p_selfie_path?: string
          p_type: Database["public"]["Enums"]["punch_type"]
        }
        Returns: {
          atrasado: boolean
          distance_m: number
          punch_id: string
          verified: boolean
          work_date: string
        }[]
      }
      remove_member: { Args: { p_membership_id: string }; Returns: undefined }
      resolved_schedule: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          break_minutes: number
          color: string
          end_time: string
          entry_id: string
          full_name: string
          location_id: string
          location_name: string
          member_role: Database["public"]["Enums"]["app_role"]
          membership_id: string
          origem: string
          shift_key: string
          shift_label: string
          start_time: string
          work_date: string
        }[]
      }
      safe_uuid: { Args: { p_texto: string }; Returns: string }
      schedule_coverage: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          color: string
          pessoas: number
          shift_key: string
          shift_label: string
          work_date: string
        }[]
      }
      schedule_summary: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          dias_com_turno: number
          dias_de_folga: number
          full_name: string
          membership_id: string
          minutos_previstos: number
        }[]
      }
      seed_default_shifts: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      set_day_shift: {
        Args: {
          p_date: string
          p_limpar?: boolean
          p_location_id?: string
          p_membership_id: string
          p_shift_key?: string
        }
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
      set_weekday_shift: {
        Args: {
          p_location_id?: string
          p_membership_id: string
          p_shift_key?: string
          p_weekday: number
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
      void_punch: {
        Args: { p_justification: string; p_punch_id: string }
        Returns: string
      }
      worked_minutes: {
        Args: { p_membership_id: string; p_work_date: string }
        Returns: {
          intervalo_min: number
          primeira: string
          trabalhado_min: number
          turno_aberto: boolean
          ultima: string
        }[]
      }
    }
    Enums: {
      absence_kind:
        | "atestado"
        | "ferias"
        | "folga"
        | "feriado"
        | "falta_justificada"
        | "outro"
      app_role: "dono" | "gerente" | "funcionario"
      day_status:
        | "trabalhado"
        | "falta"
        | "ausencia"
        | "folga"
        | "sem_escala"
        | "em_aberto"
      member_status: "ativo" | "pendente" | "inativo"
      outbox_status: "pendente" | "enviado" | "falhou"
      punch_method: "gps" | "wifi" | "ambos"
      punch_origin: "app" | "ajuste_manual" | "importacao"
      punch_type: "entrada" | "saida" | "intervalo_inicio" | "intervalo_fim"
      request_kind: "inclusao" | "ajuste" | "anulacao"
      request_status: "pendente" | "aprovada" | "recusada"
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
      absence_kind: [
        "atestado",
        "ferias",
        "folga",
        "feriado",
        "falta_justificada",
        "outro",
      ],
      app_role: ["dono", "gerente", "funcionario"],
      day_status: [
        "trabalhado",
        "falta",
        "ausencia",
        "folga",
        "sem_escala",
        "em_aberto",
      ],
      member_status: ["ativo", "pendente", "inativo"],
      outbox_status: ["pendente", "enviado", "falhou"],
      punch_method: ["gps", "wifi", "ambos"],
      punch_origin: ["app", "ajuste_manual", "importacao"],
      punch_type: ["entrada", "saida", "intervalo_inicio", "intervalo_fim"],
      request_kind: ["inclusao", "ajuste", "anulacao"],
      request_status: ["pendente", "aprovada", "recusada"],
    },
  },
} as const

