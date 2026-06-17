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
          balance_due: number
          cancelled_at: string | null
          check_in: string
          check_out: string
          children: number
          confirmed_at: string | null
          country: string | null
          created_at: string
          currency: string
          deposit_amount: number
          extras_total: number
          guest_email: string
          guest_name: string
          guest_phone: string | null
          id: string
          nights: number
          notes: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          reference: string
          room_id: string
          source: string
          special_requests: string | null
          status: Database["public"]["Enums"]["booking_status"]
          subtotal: number
          taxes: number
          total: number
          updated_at: string
        }
        Insert: {
          adults?: number
          balance_due?: number
          cancelled_at?: string | null
          check_in: string
          check_out: string
          children?: number
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number
          extras_total?: number
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          nights: number
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reference: string
          room_id: string
          source?: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal?: number
          taxes?: number
          total?: number
          updated_at?: string
        }
        Update: {
          adults?: number
          balance_due?: number
          cancelled_at?: string | null
          check_in?: string
          check_out?: string
          children?: number
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number
          extras_total?: number
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          nights?: number
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reference?: string
          room_id?: string
          source?: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal?: number
          taxes?: number
          total?: number
          updated_at?: string
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
          id: string
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
          id?: string
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
          id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_booking: {
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
    }
    Enums: {
      app_role: "admin" | "reservations" | "user"
      booking_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
      extra_unit:
        | "per_stay"
        | "per_night"
        | "per_person"
        | "per_person_per_night"
      payment_status: "unpaid" | "deposit_paid" | "paid" | "refunded"
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
      ],
      extra_unit: [
        "per_stay",
        "per_night",
        "per_person",
        "per_person_per_night",
      ],
      payment_status: ["unpaid", "deposit_paid", "paid", "refunded"],
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
