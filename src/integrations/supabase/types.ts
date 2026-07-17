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
      activity_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json
          module: string | null
          new_value: Json | null
          previous_value: Json | null
          severity: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          severity?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          severity?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      ai_activity_logs: {
        Row: {
          created_at: string
          domains_accessed: string[]
          duration_ms: number | null
          error: string | null
          evidence: Json
          id: string
          model: string | null
          question: string
          recommendation: string | null
          response: string | null
          status: string
          tool_args: Json
          tool_called: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          domains_accessed?: string[]
          duration_ms?: number | null
          error?: string | null
          evidence?: Json
          id?: string
          model?: string | null
          question: string
          recommendation?: string | null
          response?: string | null
          status?: string
          tool_args?: Json
          tool_called?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          domains_accessed?: string[]
          duration_ms?: number | null
          error?: string | null
          evidence?: Json
          id?: string
          model?: string | null
          question?: string
          recommendation?: string | null
          response?: string | null
          status?: string
          tool_args?: Json
          tool_called?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_suggestions: {
        Row: {
          created_at: string
          id: string
          input: Json
          kind: Database["public"]["Enums"]["ai_suggestion_kind"]
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["ai_suggestion_status"]
          suggestion: Json
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          input?: Json
          kind: Database["public"]["Enums"]["ai_suggestion_kind"]
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["ai_suggestion_status"]
          suggestion?: Json
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          input?: Json
          kind?: Database["public"]["Enums"]["ai_suggestion_kind"]
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["ai_suggestion_status"]
          suggestion?: Json
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          approval_kind: string
          approver_roles: string[]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          details: Json
          id: string
          requested_by: string | null
          status: string
          subject: string
          updated_at: string
          workflow_run_id: string | null
        }
        Insert: {
          approval_kind: string
          approver_roles?: string[]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          details?: Json
          id?: string
          requested_by?: string | null
          status?: string
          subject: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Update: {
          approval_kind?: string
          approver_roles?: string[]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          details?: Json
          id?: string
          requested_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_extras: {
        Row: {
          booking_id: string
          created_at: string
          extra_id: string
          id: string
          line_total: number
          quantity: number
          unit_price: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          extra_id: string
          id?: string
          line_total: number
          quantity?: number
          unit_price: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          extra_id?: string
          id?: string
          line_total?: number
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_extras_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_nights: {
        Row: {
          booking_id: string
          created_at: string
          date: string
          id: string
          nightly_rate: number
          room_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          date: string
          id?: string
          nightly_rate: number
          room_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          date?: string
          id?: string
          nightly_rate?: number
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_nights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_nights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_nights_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          balance_amount: number
          balance_due: number
          cancelled_at: string | null
          check_in: string
          check_out: string
          children: number
          children_7_plus: number
          children_below_6: number
          confirmed_at: string | null
          country: string | null
          created_at: string
          currency: string
          deposit_amount: number
          extras_total: number
          guest_email: string
          guest_id: string | null
          guest_name: string
          guest_phone: string | null
          guest_type: Database["public"]["Enums"]["guest_type"]
          id: string
          invoice_number: string | null
          nights: number
          notes: string | null
          paid_amount: number | null
          payment_completed_at: string | null
          payment_failed_at: string | null
          payment_initiated_at: string | null
          payment_method: string | null
          payment_mismatch_at: string | null
          payment_provider: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          pesapal_merchant_reference: string | null
          pesapal_order_tracking_id: string | null
          reference: string
          room_id: string
          source: string
          special_requests: string | null
          status: Database["public"]["Enums"]["booking_status"]
          subtotal: number
          taxes: number
          total: number
          updated_at: string
          visit_purpose: string | null
        }
        Insert: {
          adults?: number
          balance_amount?: number
          balance_due?: number
          cancelled_at?: string | null
          check_in: string
          check_out: string
          children?: number
          children_7_plus?: number
          children_below_6?: number
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number
          extras_total?: number
          guest_email: string
          guest_id?: string | null
          guest_name: string
          guest_phone?: string | null
          guest_type?: Database["public"]["Enums"]["guest_type"]
          id?: string
          invoice_number?: string | null
          nights: number
          notes?: string | null
          paid_amount?: number | null
          payment_completed_at?: string | null
          payment_failed_at?: string | null
          payment_initiated_at?: string | null
          payment_method?: string | null
          payment_mismatch_at?: string | null
          payment_provider?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pesapal_merchant_reference?: string | null
          pesapal_order_tracking_id?: string | null
          reference: string
          room_id: string
          source?: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal?: number
          taxes?: number
          total?: number
          updated_at?: string
          visit_purpose?: string | null
        }
        Update: {
          adults?: number
          balance_amount?: number
          balance_due?: number
          cancelled_at?: string | null
          check_in?: string
          check_out?: string
          children?: number
          children_7_plus?: number
          children_below_6?: number
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number
          extras_total?: number
          guest_email?: string
          guest_id?: string | null
          guest_name?: string
          guest_phone?: string | null
          guest_type?: Database["public"]["Enums"]["guest_type"]
          id?: string
          invoice_number?: string | null
          nights?: number
          notes?: string | null
          paid_amount?: number | null
          payment_completed_at?: string | null
          payment_failed_at?: string | null
          payment_initiated_at?: string | null
          payment_method?: string | null
          payment_mismatch_at?: string | null
          payment_provider?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pesapal_merchant_reference?: string | null
          pesapal_order_tracking_id?: string | null
          reference?: string
          room_id?: string
          source?: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal?: number
          taxes?: number
          total?: number
          updated_at?: string
          visit_purpose?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_tokens: {
        Row: {
          category: string
          created_at: string
          id: string
          key: string
          label: string
          notes: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          key: string
          label: string
          notes?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          notes?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          associated_content: Json
          audience: string | null
          budget: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          end_date: string | null
          id: string
          landing_page: string | null
          name: string
          notes: string | null
          objective: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          associated_content?: Json
          audience?: string | null
          budget?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          end_date?: string | null
          id?: string
          landing_page?: string | null
          name: string
          notes?: string | null
          objective?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          associated_content?: Json
          audience?: string | null
          budget?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          end_date?: string | null
          id?: string
          landing_page?: string | null
          name?: string
          notes?: string | null
          objective?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      cms_blocks: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_visible: boolean
          kind: Database["public"]["Enums"]["cms_block_kind"]
          page_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          is_visible?: boolean
          kind: Database["public"]["Enums"]["cms_block_kind"]
          page_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_visible?: boolean
          kind?: Database["public"]["Enums"]["cms_block_kind"]
          page_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_blocks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          page_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          page_id: string
          snapshot?: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          page_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_versions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          published_at: string | null
          route_path: string | null
          scheduled_at: string | null
          slug: string
          status: Database["public"]["Enums"]["cms_page_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          route_path?: string | null
          scheduled_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["cms_page_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          route_path?: string | null
          scheduled_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["cms_page_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      content_calendar_entries: {
        Row: {
          created_at: string
          ends_at: string | null
          entry_type: Database["public"]["Enums"]["calendar_entry_type"]
          id: string
          linked_id: string | null
          linked_type: string | null
          notes: string | null
          owner: string | null
          scheduled_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          entry_type: Database["public"]["Enums"]["calendar_entry_type"]
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          notes?: string | null
          owner?: string | null
          scheduled_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          entry_type?: Database["public"]["Enums"]["calendar_entry_type"]
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          notes?: string | null
          owner?: string | null
          scheduled_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          booking_id: string | null
          event_type: string
          id: string
          message_id: string | null
          metadata: Json
          occurred_at: string
          recipient_email: string | null
          template_name: string | null
        }
        Insert: {
          booking_id?: string | null
          event_type: string
          id?: string
          message_id?: string | null
          metadata?: Json
          occurred_at?: string
          recipient_email?: string | null
          template_name?: string | null
        }
        Update: {
          booking_id?: string | null
          event_type?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          occurred_at?: string
          recipient_email?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      extras: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          price: number
          slug: string
          sort_order: number
          unit: Database["public"]["Enums"]["extra_unit"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          price: number
          slug: string
          sort_order?: number
          unit?: Database["public"]["Enums"]["extra_unit"]
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          slug?: string
          sort_order?: number
          unit?: Database["public"]["Enums"]["extra_unit"]
        }
        Relationships: []
      }
      financial_alerts: {
        Row: {
          alert_type: string
          amount: number | null
          booking_id: string | null
          created_at: string
          currency: string | null
          detail: string | null
          id: string
          metadata: Json
          reference: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          detail?: string | null
          id?: string
          metadata?: Json
          reference?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          detail?: string | null
          id?: string
          metadata?: Json
          reference?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_communications: {
        Row: {
          author_id: string | null
          body: string | null
          booking_id: string | null
          channel: string
          created_at: string
          direction: string
          guest_id: string
          id: string
          meta: Json
          occurred_at: string
          subject: string | null
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          booking_id?: string | null
          channel: string
          created_at?: string
          direction: string
          guest_id: string
          id?: string
          meta?: Json
          occurred_at?: string
          subject?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string | null
          booking_id?: string | null
          channel?: string
          created_at?: string
          direction?: string
          guest_id?: string
          id?: string
          meta?: Json
          occurred_at?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_communications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_communications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_communications_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_communications_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_communications_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_documents: {
        Row: {
          created_at: string
          created_by: string | null
          guest_id: string
          id: string
          kind: string
          label: string | null
          meta: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          guest_id: string
          id?: string
          kind: string
          label?: string | null
          meta?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          guest_id?: string
          id?: string
          kind?: string
          label?: string | null
          meta?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          guest_id: string
          history: Json
          id: string
          is_deleted: boolean
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          guest_id: string
          history?: Json
          id?: string
          is_deleted?: boolean
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          guest_id?: string
          history?: Json
          id?: string
          is_deleted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_preferences: {
        Row: {
          category: string
          created_at: string
          guest_id: string
          id: string
          key: string
          source: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          category?: string
          created_at?: string
          guest_id: string
          id?: string
          key: string
          source?: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          category?: string
          created_at?: string
          guest_id?: string
          id?: string
          key?: string
          source?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_preferences_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_preferences_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_preferences_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_tag_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          guest_id: string
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          guest_id: string
          tag_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          guest_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_tag_assignments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_tag_assignments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_tag_assignments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "guest_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          slug: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          slug: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          slug?: string
        }
        Relationships: []
      }
      guest_threads: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          last_updated: string
          notes: string | null
          timeline: Json
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          last_updated?: string
          notes?: string | null
          timeline?: Json
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          last_updated?: string
          notes?: string | null
          timeline?: Json
        }
        Relationships: [
          {
            foreignKeyName: "guest_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          ai_summary: string | null
          ai_summary_updated_at: string | null
          anniversary: string | null
          avatar_url: string | null
          birthday: string | null
          communication_preference: Database["public"]["Enums"]["communication_preference"]
          country: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          internal_notes: string | null
          is_deleted: boolean
          marketing_consent: boolean
          merged_into: string | null
          nationality: string | null
          phone_e164: string | null
          preferred_language: string | null
          status: Database["public"]["Enums"]["guest_status"]
          status_override: boolean
          time_zone: string | null
          updated_at: string
          vip_since: string | null
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          anniversary?: string | null
          avatar_url?: string | null
          birthday?: string | null
          communication_preference?: Database["public"]["Enums"]["communication_preference"]
          country?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean
          marketing_consent?: boolean
          merged_into?: string | null
          nationality?: string | null
          phone_e164?: string | null
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["guest_status"]
          status_override?: boolean
          time_zone?: string | null
          updated_at?: string
          vip_since?: string | null
        }
        Update: {
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          anniversary?: string | null
          avatar_url?: string | null
          birthday?: string | null
          communication_preference?: Database["public"]["Enums"]["communication_preference"]
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean
          marketing_consent?: boolean
          merged_into?: string | null
          nationality?: string | null
          phone_e164?: string | null
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["guest_status"]
          status_override?: boolean
          time_zone?: string | null
          updated_at?: string
          vip_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guests_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_article_tags: {
        Row: {
          article_id: string
          tag_id: string
        }
        Insert: {
          article_id: string
          tag_id: string
        }
        Update: {
          article_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_article_tags_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "journal_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_article_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "journal_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_article_versions: {
        Row: {
          article_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          article_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          snapshot?: Json
          version: number
        }
        Update: {
          article_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "journal_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_articles: {
        Row: {
          author_id: string | null
          category_id: string | null
          content_html: string | null
          content_json: Json | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          featured: boolean
          id: string
          published_at: string | null
          read_minutes: number | null
          scheduled_at: string | null
          seo_description: string | null
          seo_og_image: string | null
          seo_title: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          featured?: boolean
          id?: string
          published_at?: string | null
          read_minutes?: number | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_og_image?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          featured?: boolean
          id?: string
          published_at?: string | null
          read_minutes?: number | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_og_image?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "journal_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "journal_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_authors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      knowledge_categories: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          id: string
          tsv: unknown
          version: number
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          id?: string
          tsv?: unknown
          version: number
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          tsv?: unknown
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_document_versions: {
        Row: {
          byte_size: number | null
          change_note: string | null
          checksum: string | null
          content_text: string
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          version: number
        }
        Insert: {
          byte_size?: number | null
          change_note?: string | null
          checksum?: string | null
          content_text: string
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          version: number
        }
        Update: {
          byte_size?: number | null
          change_note?: string | null
          checksum?: string | null
          content_text?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["app_role"][] | null
          byte_size: number | null
          category_id: string | null
          created_at: string
          created_by: string | null
          current_version: number
          id: string
          slug: string
          source_type: string
          source_url: string | null
          status: string
          storage_path: string | null
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][] | null
          byte_size?: number | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          slug: string
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][] | null
          byte_size?: number | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          slug?: string
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          caption: string | null
          content_hash: string | null
          created_at: string
          filename: string
          folder_id: string | null
          height: number | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          tags: string[] | null
          updated_at: string
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          content_hash?: string | null
          created_at?: string
          filename: string
          folder_id?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          tags?: string[] | null
          updated_at?: string
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          content_hash?: string | null
          created_at?: string
          filename?: string
          folder_id?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          tags?: string[] | null
          updated_at?: string
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      media_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      media_usage: {
        Row: {
          asset_id: string
          created_at: string
          field: string | null
          id: string
          used_in_id: string
          used_in_type: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          field?: string | null
          id?: string
          used_in_id: string
          used_in_type: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          field?: string | null
          id?: string
          used_in_id?: string
          used_in_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_usage_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          delivered_at: string | null
          href: string | null
          id: string
          kind: string | null
          meta: Json
          read_at: string | null
          role: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          href?: string | null
          id?: string
          kind?: string | null
          meta?: Json
          read_at?: string | null
          role?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          href?: string | null
          id?: string
          kind?: string | null
          meta?: Json
          read_at?: string | null
          role?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ops_alerts: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["ops_alert_kind"]
          message: string
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["ops_alert_kind"]
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["ops_alert_kind"]
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_alerts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_tasks: {
        Row: {
          assigned_to: string | null
          assignee_id: string | null
          booking_id: string | null
          category: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          priority: number
          status: Database["public"]["Enums"]["ops_task_status"]
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assignee_id?: string | null
          booking_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: number
          status?: Database["public"]["Enums"]["ops_task_status"]
          task_type: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assignee_id?: string | null
          booking_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: number
          status?: Database["public"]["Enums"]["ops_task_status"]
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          booking_id: string | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          merchant_reference: string | null
          order_tracking_id: string | null
          payment_method: string | null
          provider: string
          raw: Json | null
          status_code: number | null
        }
        Insert: {
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          merchant_reference?: string | null
          order_tracking_id?: string | null
          payment_method?: string | null
          provider?: string
          raw?: Json | null
          status_code?: number | null
        }
        Update: {
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          merchant_reference?: string | null
          order_tracking_id?: string | null
          payment_method?: string | null
          provider?: string
          raw?: Json | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_notifications: {
        Row: {
          attempts: number
          booking_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
        }
        Insert: {
          attempts?: number
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          attempts?: number
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      pesapal_settings: {
        Row: {
          created_at: string
          env: string
          ipn_id: string
          ipn_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          env: string
          ipn_id: string
          ipn_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          env?: string
          ipn_id?: string
          ipn_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          active: boolean
          adjust_kind: string | null
          adjust_value: number | null
          code: string | null
          created_at: string
          ends_on: string | null
          id: string
          min_stay_nights: number | null
          name: string
          notes: string | null
          priority: number
          room_id: string | null
          rule_type: string
          scope: string
          starts_on: string | null
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
          active?: boolean
          adjust_kind?: string | null
          adjust_value?: number | null
          code?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          min_stay_nights?: number | null
          name: string
          notes?: string | null
          priority?: number
          room_id?: string | null
          rule_type: string
          scope?: string
          starts_on?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
          active?: boolean
          adjust_kind?: string | null
          adjust_value?: number | null
          code?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          min_stay_nights?: number | null
          name?: string
          notes?: string | null
          priority?: number
          room_id?: string | null
          rule_type?: string
          scope?: string
          starts_on?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      review_statistics: {
        Row: {
          created_at: string
          overall_rating: number
          profile_url: string | null
          source: Database["public"]["Enums"]["review_source"]
          total_reviews: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          overall_rating: number
          profile_url?: string | null
          source: Database["public"]["Enums"]["review_source"]
          total_reviews: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          overall_rating?: number
          profile_url?: string | null
          source?: Database["public"]["Enums"]["review_source"]
          total_reviews?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          categories: Database["public"]["Enums"]["review_category"][]
          created_at: string
          created_by: string | null
          external_url: string | null
          featured: boolean
          guest_location: string | null
          guest_name: string
          id: string
          imported_at: string | null
          imported_by: string | null
          imported_from: string | null
          last_modified_at: string | null
          last_modified_by: string | null
          medium_summary: string | null
          original_review: string | null
          rating: number
          review_date: string
          review_text: string
          review_url: string | null
          short_summary: string | null
          source: Database["public"]["Enums"]["review_source"]
          status: Database["public"]["Enums"]["review_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          categories?: Database["public"]["Enums"]["review_category"][]
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          featured?: boolean
          guest_location?: string | null
          guest_name: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          imported_from?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          medium_summary?: string | null
          original_review?: string | null
          rating: number
          review_date: string
          review_text: string
          review_url?: string | null
          short_summary?: string | null
          source: Database["public"]["Enums"]["review_source"]
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          categories?: Database["public"]["Enums"]["review_category"][]
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          featured?: boolean
          guest_location?: string | null
          guest_name?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          imported_from?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          medium_summary?: string | null
          original_review?: string | null
          rating?: number
          review_date?: string
          review_text?: string
          review_url?: string | null
          short_summary?: string | null
          source?: Database["public"]["Enums"]["review_source"]
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      room_inventory: {
        Row: {
          available_units: number
          block_reason: string | null
          date: string
          is_blocked: boolean
          price_override: number | null
          room_id: string
          updated_at: string
        }
        Insert: {
          available_units: number
          block_reason?: string | null
          date: string
          is_blocked?: boolean
          price_override?: number | null
          room_id: string
          updated_at?: string
        }
        Update: {
          available_units?: number
          block_reason?: string | null
          date?: string
          is_blocked?: boolean
          price_override?: number | null
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_inventory_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_states: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          room_id: string
          state: Database["public"]["Enums"]["room_state"]
          state_note: string | null
          unit_label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          room_id: string
          state?: Database["public"]["Enums"]["room_state"]
          state_note?: string | null
          unit_label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          room_id?: string
          state?: Database["public"]["Enums"]["room_state"]
          state_note?: string | null
          unit_label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_states_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_states_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_states_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          base_price: number
          capacity_adults: number
          capacity_children: number
          created_at: string
          currency: string
          extra_guest_fee: number
          id: string
          included_guests: number
          max_occupancy: number
          name: string
          short_description: string | null
          slug: string
          sort_order: number
          status: string
          total_units: number
          updated_at: string
        }
        Insert: {
          base_price: number
          capacity_adults?: number
          capacity_children?: number
          created_at?: string
          currency?: string
          extra_guest_fee?: number
          id?: string
          included_guests?: number
          max_occupancy?: number
          name: string
          short_description?: string | null
          slug: string
          sort_order?: number
          status?: string
          total_units?: number
          updated_at?: string
        }
        Update: {
          base_price?: number
          capacity_adults?: number
          capacity_children?: number
          created_at?: string
          currency?: string
          extra_guest_fee?: number
          id?: string
          included_guests?: number
          max_occupancy?: number
          name?: string
          short_description?: string | null
          slug?: string
          sort_order?: number
          status?: string
          total_units?: number
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_jobs: {
        Row: {
          config: Json
          created_at: string
          cron_expression: string
          description: string | null
          enabled: boolean
          id: string
          job_type: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          cron_expression: string
          description?: string | null
          enabled?: boolean
          id?: string
          job_type: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          cron_expression?: string
          description?: string | null
          enabled?: boolean
          id?: string
          job_type?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seo_overrides: {
        Row: {
          canonical_url: string | null
          created_at: string
          description: string | null
          id: string
          index_status: boolean
          keywords: string[] | null
          notes: string | null
          og_description: string | null
          og_image: string | null
          og_title: string | null
          robots: string | null
          route_path: string
          schema_type: string | null
          title: string | null
          twitter_card: string | null
          twitter_description: string | null
          twitter_image: string | null
          twitter_title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          index_status?: boolean
          keywords?: string[] | null
          notes?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          robots?: string | null
          route_path: string
          schema_type?: string | null
          title?: string | null
          twitter_card?: string | null
          twitter_description?: string | null
          twitter_image?: string | null
          twitter_title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          index_status?: boolean
          keywords?: string[] | null
          notes?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          robots?: string | null
          route_path?: string
          schema_type?: string | null
          title?: string | null
          twitter_card?: string | null
          twitter_description?: string | null
          twitter_image?: string | null
          twitter_title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_alerts: {
        Row: {
          booking_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string
          message: string
          provider_sid: string | null
          sent_at: string | null
          status: string
          to_number: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          message: string
          provider_sid?: string | null
          sent_at?: string | null
          status?: string
          to_number: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          message?: string
          provider_sid?: string | null
          sent_at?: string | null
          status?: string
          to_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_run_steps: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          result: Json | null
          run_id: string
          started_at: string
          status: string
          step_config: Json
          step_index: number
          step_type: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          result?: Json | null
          run_id: string
          started_at?: string
          status?: string
          step_config?: Json
          step_index: number
          step_type: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          result?: Json | null
          run_id?: string
          started_at?: string
          status?: string
          step_config?: Json
          step_index?: number
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          conditions_met: boolean | null
          correlation_id: string | null
          error: string | null
          event_payload: Json
          finished_at: string | null
          id: string
          retry_count: number
          started_at: string
          status: string
          trigger_event: string
          workflow_id: string
        }
        Insert: {
          conditions_met?: boolean | null
          correlation_id?: string | null
          error?: string | null
          event_payload?: Json
          finished_at?: string | null
          id?: string
          retry_count?: number
          started_at?: string
          status?: string
          trigger_event: string
          workflow_id: string
        }
        Update: {
          conditions_met?: boolean | null
          correlation_id?: string | null
          error?: string | null
          event_payload?: Json
          finished_at?: string | null
          id?: string
          retry_count?: number
          started_at?: string
          status?: string
          trigger_event?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          actions: Json
          approver_roles: string[]
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          is_template: boolean
          name: string
          requires_approval: boolean
          trigger_event: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          approver_roles?: string[]
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_template?: boolean
          name: string
          requires_approval?: boolean
          trigger_event: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          approver_roles?: string[]
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_template?: boolean
          name?: string
          requires_approval?: boolean
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      guest_country_stats: {
        Row: {
          country: string | null
          guest_count: number | null
          returning_count: number | null
          vip_count: number | null
        }
        Relationships: []
      }
      guest_directory: {
        Row: {
          avatar_url: string | null
          cancelled_count: number | null
          communication_preference:
            | Database["public"]["Enums"]["communication_preference"]
            | null
          country: string | null
          created_at: string | null
          email: string | null
          first_stay: string | null
          full_name: string | null
          id: string | null
          internal_notes: string | null
          last_stay: string | null
          lifetime_spend: number | null
          nationality: string | null
          phone_e164: string | null
          preferred_language: string | null
          status: Database["public"]["Enums"]["guest_status"] | null
          tag_ids: string[] | null
          time_zone: string | null
          total_nights: number | null
          total_stays: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      guest_metrics: {
        Row: {
          avg_lead_time_days: number | null
          avg_nights: number | null
          avg_party_size: number | null
          avg_spend: number | null
          cancellation_rate: number | null
          cancelled: number | null
          favourite_experience: string | null
          favourite_room_id: string | null
          guest_id: string | null
          is_repeat: boolean | null
          stays: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["favourite_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_outstanding_balances: {
        Row: {
          balance_amount: number | null
          check_in: string | null
          check_out: string | null
          currency: string | null
          guest_email: string | null
          guest_id: string | null
          guest_name: string | null
          id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          reference: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          total: number | null
        }
        Insert: {
          balance_amount?: number | null
          check_in?: string | null
          check_out?: string | null
          currency?: string | null
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          reference?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          total?: number | null
        }
        Update: {
          balance_amount?: number | null
          check_in?: string | null
          check_out?: string | null
          currency?: string | null
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          reference?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_today: {
        Row: {
          arrivals: number | null
          departures: number | null
          dirty_rooms: number | null
          in_house: number | null
          maintenance_rooms: number | null
          occupied_rooms: number | null
          outstanding_total: number | null
          pending_check_in: number | null
          pending_check_out: number | null
          vacant_rooms: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_booking:
        | {
            Args: {
              _adults: number
              _check_in: string
              _check_out: string
              _children: number
              _country: string
              _extras?: Json
              _guest_email: string
              _guest_name: string
              _guest_phone: string
              _room_slug: string
              _special_requests: string
            }
            Returns: {
              booking_id: string
              currency: string
              reference: string
              total: number
            }[]
          }
        | {
            Args: {
              _adults: number
              _check_in: string
              _check_out: string
              _children: number
              _children_7_plus?: number
              _children_below_6?: number
              _country: string
              _extras?: Json
              _guest_email: string
              _guest_name: string
              _guest_phone: string
              _room_slug: string
              _special_requests: string
            }
            Returns: {
              booking_id: string
              currency: string
              reference: string
              total: number
            }[]
          }
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      detect_guest_type: {
        Args: { _purpose: string; _special: string }
        Returns: Database["public"]["Enums"]["guest_type"]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_duplicate_guests: {
        Args: never
        Returns: {
          cluster_key: string
          guest_ids: string[]
          match_type: string
          sample_emails: string[]
          sample_names: string[]
        }[]
      }
      get_review_aggregates: {
        Args: never
        Returns: {
          average_rating: number
          review_count: number
          source: Database["public"]["Enums"]["review_source"]
        }[]
      }
      get_room_availability: {
        Args: { _check_in: string; _check_out: string }
        Returns: {
          base_price: number
          capacity_adults: number
          capacity_children: number
          currency: string
          is_available: boolean
          max_occupancy: number
          min_available: number
          name: string
          nightly_total: number
          nights: number
          room_id: string
          slug: string
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_staff: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      knowledge_can_read_document: {
        Args: { _doc_id: string }
        Returns: boolean
      }
      knowledge_search: {
        Args: { _limit?: number; _query: string }
        Returns: {
          category_slug: string
          chunk_id: string
          chunk_index: number
          content: string
          document_id: string
          document_slug: string
          document_title: string
          rank: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      ai_suggestion_kind:
        | "seo_title"
        | "seo_meta"
        | "seo_keywords"
        | "internal_links"
        | "faq"
        | "alt_text"
        | "testimonial_summary"
        | "related_articles"
        | "other"
      ai_suggestion_status: "pending" | "approved" | "rejected" | "applied"
      app_role:
        | "admin"
        | "reservations"
        | "user"
        | "owner"
        | "manager"
        | "reception"
        | "marketing"
        | "housekeeping"
        | "finance"
        | "editor"
      booking_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
        | "checked_in"
      calendar_entry_type:
        | "journal"
        | "homepage"
        | "campaign"
        | "promotion"
        | "social"
        | "other"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "archived"
      cms_block_kind:
        | "hero"
        | "rich_text"
        | "image_gallery"
        | "cta"
        | "reviews"
        | "rooms"
        | "experiences"
        | "faq"
        | "video"
        | "statistics"
        | "contact"
        | "map"
      cms_page_status:
        | "draft"
        | "review"
        | "scheduled"
        | "published"
        | "archived"
      communication_preference: "email" | "whatsapp" | "sms" | "none"
      extra_unit:
        | "per_stay"
        | "per_night"
        | "per_person"
        | "per_person_per_night"
      guest_status: "new" | "returning" | "vip"
      guest_type: "standard" | "vip" | "climber"
      ops_alert_kind:
        | "late_arrival"
        | "overdue_departure"
        | "payment_issue"
        | "room_conflict"
        | "maintenance_conflict"
      ops_task_status: "pending" | "in_progress" | "completed" | "cancelled"
      payment_status:
        | "unpaid"
        | "deposit_paid"
        | "paid"
        | "refunded"
        | "payment_mismatch"
      review_category:
        | "hospitality_service"
        | "tranquility_nature"
        | "safari_gateway"
        | "rooms_comfort"
        | "dining"
        | "pool_family"
        | "overall_experience"
      review_source: "google" | "tripadvisor" | "direct"
      review_status: "pending" | "approved" | "archived"
      room_state:
        | "vacant_clean"
        | "vacant_dirty"
        | "occupied"
        | "reserved"
        | "inspection"
        | "maintenance"
        | "out_of_service"
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
  public: {
    Enums: {
      ai_suggestion_kind: [
        "seo_title",
        "seo_meta",
        "seo_keywords",
        "internal_links",
        "faq",
        "alt_text",
        "testimonial_summary",
        "related_articles",
        "other",
      ],
      ai_suggestion_status: ["pending", "approved", "rejected", "applied"],
      app_role: [
        "admin",
        "reservations",
        "user",
        "owner",
        "manager",
        "reception",
        "marketing",
        "housekeeping",
        "finance",
        "editor",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
        "checked_in",
      ],
      calendar_entry_type: [
        "journal",
        "homepage",
        "campaign",
        "promotion",
        "social",
        "other",
      ],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "archived",
      ],
      cms_block_kind: [
        "hero",
        "rich_text",
        "image_gallery",
        "cta",
        "reviews",
        "rooms",
        "experiences",
        "faq",
        "video",
        "statistics",
        "contact",
        "map",
      ],
      cms_page_status: [
        "draft",
        "review",
        "scheduled",
        "published",
        "archived",
      ],
      communication_preference: ["email", "whatsapp", "sms", "none"],
      extra_unit: [
        "per_stay",
        "per_night",
        "per_person",
        "per_person_per_night",
      ],
      guest_status: ["new", "returning", "vip"],
      guest_type: ["standard", "vip", "climber"],
      ops_alert_kind: [
        "late_arrival",
        "overdue_departure",
        "payment_issue",
        "room_conflict",
        "maintenance_conflict",
      ],
      ops_task_status: ["pending", "in_progress", "completed", "cancelled"],
      payment_status: [
        "unpaid",
        "deposit_paid",
        "paid",
        "refunded",
        "payment_mismatch",
      ],
      review_category: [
        "hospitality_service",
        "tranquility_nature",
        "safari_gateway",
        "rooms_comfort",
        "dining",
        "pool_family",
        "overall_experience",
      ],
      review_source: ["google", "tripadvisor", "direct"],
      review_status: ["pending", "approved", "archived"],
      room_state: [
        "vacant_clean",
        "vacant_dirty",
        "occupied",
        "reserved",
        "inspection",
        "maintenance",
        "out_of_service",
      ],
    },
  },
} as const
