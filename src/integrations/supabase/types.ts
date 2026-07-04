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
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
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
        ]
      }
      ops_tasks: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
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
          booking_id?: string | null
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
          booking_id?: string | null
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
          rating: number
          review_date: string
          review_text: string
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
          rating: number
          review_date: string
          review_text: string
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
          rating?: number
          review_date?: string
          review_text?: string
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
        ]
      }
    }
    Views: {
      [_ in never]: never
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
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
      app_role: "admin" | "reservations" | "user"
      booking_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
        | "checked_in"
      extra_unit:
        | "per_stay"
        | "per_night"
        | "per_person"
        | "per_person_per_night"
      guest_type: "standard" | "vip" | "climber"
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
      app_role: ["admin", "reservations", "user"],
      booking_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
        "checked_in",
      ],
      extra_unit: [
        "per_stay",
        "per_night",
        "per_person",
        "per_person_per_night",
      ],
      guest_type: ["standard", "vip", "climber"],
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
    },
  },
} as const
