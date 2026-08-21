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
      admin_logs: {
        Row: {
          created_at: string | null
          detail: string | null
          event: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          detail?: string | null
          event?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          detail?: string | null
          event?: string | null
          id?: string
        }
        Relationships: []
      }
      bay_agent_status: {
        Row: {
          agent_version: string | null
          bay_id: string
          enforcement_mode: string | null
          kiosk_kills: Json | null
          last_crash_restart_at: string | null
          last_heartbeat_at: string | null
          override_state: string | null
          running_processes: Json | null
          session_state: string | null
          sim_running: boolean | null
          updated_at: string
        }
        Insert: {
          agent_version?: string | null
          bay_id: string
          enforcement_mode?: string | null
          kiosk_kills?: Json | null
          last_crash_restart_at?: string | null
          last_heartbeat_at?: string | null
          override_state?: string | null
          running_processes?: Json | null
          session_state?: string | null
          sim_running?: boolean | null
          updated_at?: string
        }
        Update: {
          agent_version?: string | null
          bay_id?: string
          enforcement_mode?: string | null
          kiosk_kills?: Json | null
          last_crash_restart_at?: string | null
          last_heartbeat_at?: string | null
          override_state?: string | null
          running_processes?: Json | null
          session_state?: string | null
          sim_running?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bay_agent_status_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: true
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      bays: {
        Row: {
          active: boolean
          agent_token: string | null
          created_at: string
          id: string
          name: string
          number: number
        }
        Insert: {
          active?: boolean
          agent_token?: string | null
          created_at?: string
          id?: string
          name: string
          number: number
        }
        Update: {
          active?: boolean
          agent_token?: string | null
          created_at?: string
          id?: string
          name?: string
          number?: number
        }
        Relationships: []
      }
      blocked_times: {
        Row: {
          bay_id: string | null
          created_at: string
          created_by: string
          ends_at: string
          id: string
          reason: string | null
          starts_at: string
        }
        Insert: {
          bay_id?: string | null
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          reason?: string | null
          starts_at: string
        }
        Update: {
          bay_id?: string | null
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          reason?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_times_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_times_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          access_code: string | null
          access_code_issued_at: string | null
          access_sent_at: string | null
          bay_id: string
          bay_powered_off_at: string | null
          bay_powered_on_at: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          coupon_discount: number
          coupon_id: string | null
          created_at: string
          credit_discount: number
          credit_hours_applied: number
          discount_percent_applied: number | null
          duration_minutes: number
          ends_at: string
          extend_token: string | null
          gift_card_applied: number
          gift_card_id: string | null
          id: string
          member_rate_applied: number | null
          membership_discount: number
          membership_id: string | null
          notes: string | null
          paid_at: string | null
          price_per_hour: number
          rate_type: string | null
          refund_amount: number | null
          refunded_at: string | null
          reminder_sent_at: string | null
          signup_bonus_applied: boolean | null
          source: string
          starts_at: string
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax: number
          total: number
          unifi_access_policy_id: string | null
          unifi_schedule_id: string | null
          unifi_visitor_id: string | null
          user_id: string
        }
        Insert: {
          access_code?: string | null
          access_code_issued_at?: string | null
          access_sent_at?: string | null
          bay_id: string
          bay_powered_off_at?: string | null
          bay_powered_on_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          coupon_discount?: number
          coupon_id?: string | null
          created_at?: string
          credit_discount?: number
          credit_hours_applied?: number
          discount_percent_applied?: number | null
          duration_minutes: number
          ends_at: string
          extend_token?: string | null
          gift_card_applied?: number
          gift_card_id?: string | null
          id?: string
          member_rate_applied?: number | null
          membership_discount?: number
          membership_id?: string | null
          notes?: string | null
          paid_at?: string | null
          price_per_hour: number
          rate_type?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          reminder_sent_at?: string | null
          signup_bonus_applied?: boolean | null
          source?: string
          starts_at: string
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal: number
          tax?: number
          total: number
          unifi_access_policy_id?: string | null
          unifi_schedule_id?: string | null
          unifi_visitor_id?: string | null
          user_id: string
        }
        Update: {
          access_code?: string | null
          access_code_issued_at?: string | null
          access_sent_at?: string | null
          bay_id?: string
          bay_powered_off_at?: string | null
          bay_powered_on_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          coupon_discount?: number
          coupon_id?: string | null
          created_at?: string
          credit_discount?: number
          credit_hours_applied?: number
          discount_percent_applied?: number | null
          duration_minutes?: number
          ends_at?: string
          extend_token?: string | null
          gift_card_applied?: number
          gift_card_id?: string | null
          id?: string
          member_rate_applied?: number | null
          membership_discount?: number
          membership_id?: string | null
          notes?: string | null
          paid_at?: string | null
          price_per_hour?: number
          rate_type?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          reminder_sent_at?: string | null
          signup_bonus_applied?: boolean | null
          source?: string
          starts_at?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          unifi_access_policy_id?: string | null
          unifi_schedule_id?: string | null
          unifi_visitor_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "member_effective_pricing"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "bookings_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          caller_name: string | null
          caller_phone: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          ended_reason: string | null
          id: string
          recording_url: string | null
          started_at: string | null
          summary: string | null
          transcript: string | null
          vapi_call_id: string | null
        }
        Insert: {
          caller_name?: string | null
          caller_phone?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          recording_url?: string | null
          started_at?: string | null
          summary?: string | null
          transcript?: string | null
          vapi_call_id?: string | null
        }
        Update: {
          caller_name?: string | null
          caller_phone?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          recording_url?: string | null
          started_at?: string | null
          summary?: string | null
          transcript?: string | null
          vapi_call_id?: string | null
        }
        Relationships: []
      }
      campaign_flags: {
        Row: {
          campaign: string
          sent_at: string
        }
        Insert: {
          campaign: string
          sent_at?: string
        }
        Update: {
          campaign?: string
          sent_at?: string
        }
        Relationships: []
      }
      campaign_sends: {
        Row: {
          campaign: string
          email: string
          id: string
          sent_at: string | null
        }
        Insert: {
          campaign: string
          email: string
          id?: string
          sent_at?: string | null
        }
        Update: {
          campaign?: string
          email?: string
          id?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      coupon_uses: {
        Row: {
          booking_id: string | null
          coupon_id: string
          id: string
          used_at: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          coupon_id: string
          id?: string
          used_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          coupon_id?: string
          id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_uses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_uses_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_uses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          max_uses: number | null
          max_uses_per_user: number | null
          name: string | null
          uses_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          max_uses_per_user?: number | null
          name?: string | null
          uses_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          max_uses_per_user?: number | null
          name?: string | null
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disclosure_acknowledgments: {
        Row: {
          acknowledged_at: string
          body_snapshot: string | null
          booking_id: string | null
          disclosure_id: string
          id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          body_snapshot?: string | null
          booking_id?: string | null
          disclosure_id: string
          id?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          body_snapshot?: string | null
          booking_id?: string | null
          disclosure_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disclosure_acknowledgments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disclosure_acknowledgments_disclosure_id_fkey"
            columns: ["disclosure_id"]
            isOneToOne: false
            referencedRelation: "disclosures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disclosure_acknowledgments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disclosures: {
        Row: {
          active: boolean
          body: string
          created_at: string
          id: string
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          id?: string
          title: string
          version?: number
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          id?: string
          title?: string
          version?: number
        }
        Relationships: []
      }
      event_leads: {
        Row: {
          caller_phone: string | null
          created_at: string
          event_date: string | null
          event_type: string | null
          id: string
          name: string | null
          phone: string | null
        }
        Insert: {
          caller_phone?: string | null
          created_at?: string
          event_date?: string | null
          event_type?: string | null
          id?: string
          name?: string | null
          phone?: string | null
        }
        Update: {
          caller_phone?: string | null
          created_at?: string
          event_date?: string | null
          event_type?: string | null
          id?: string
          name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      gift_card_transactions: {
        Row: {
          amount: number
          balance_after: number
          booking_id: string | null
          created_at: string
          gift_card_id: string
          id: string
        }
        Insert: {
          amount: number
          balance_after: number
          booking_id?: string | null
          created_at?: string
          gift_card_id: string
          id?: string
        }
        Update: {
          amount?: number
          balance_after?: number
          booking_id?: string | null
          created_at?: string
          gift_card_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          active: boolean
          balance: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          original_amount: number
          purchased_by: string | null
          recipient_email: string | null
          recipient_name: string | null
          stripe_payment_id: string | null
        }
        Insert: {
          active?: boolean
          balance: number
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          original_amount: number
          purchased_by?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          stripe_payment_id?: string | null
        }
        Update: {
          active?: boolean
          balance?: number
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          original_amount?: number
          purchased_by?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          stripe_payment_id?: string | null
        }
        Relationships: []
      }
      hour_credit_uses: {
        Row: {
          booking_id: string
          created_at: string
          hour_credit_id: string
          hours_used: number
          id: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          hour_credit_id: string
          hours_used: number
          id?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          hour_credit_id?: string
          hours_used?: number
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hour_credit_uses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hour_credit_uses_hour_credit_id_fkey"
            columns: ["hour_credit_id"]
            isOneToOne: false
            referencedRelation: "hour_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hour_credit_uses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hour_credits: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          hours: number
          hours_remaining: number
          id: string
          reason: string | null
          redeemed_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          hours: number
          hours_remaining: number
          id?: string
          reason?: string | null
          redeemed_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          hours?: number
          hours_remaining?: number
          id?: string
          reason?: string | null
          redeemed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hour_credits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hour_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_participants: {
        Row: {
          active: boolean
          id: string
          joined_at: string
          league_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          joined_at?: string
          league_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          id?: string
          joined_at?: string
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_participants_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          active: boolean
          bay_id: string | null
          created_at: string
          created_by: string | null
          day_of_week: number | null
          description: string | null
          duration_minutes: number
          ends_on: string | null
          id: string
          max_players: number | null
          name: string
          price_per_session: number | null
          start_time: string
          starts_on: string
        }
        Insert: {
          active?: boolean
          bay_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week?: number | null
          description?: string | null
          duration_minutes?: number
          ends_on?: string | null
          id?: string
          max_players?: number | null
          name: string
          price_per_session?: number | null
          start_time: string
          starts_on: string
        }
        Update: {
          active?: boolean
          bay_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week?: number | null
          description?: string | null
          duration_minutes?: number
          ends_on?: string | null
          id?: string
          max_players?: number | null
          name?: string
          price_per_session?: number | null
          start_time?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          active: boolean
          advance_booking_days: number
          annual_price: number | null
          created_at: string
          discount_floor: number | null
          discount_percent: number
          display_name: string | null
          first_year_discount: number | null
          id: string
          joining_fee: number | null
          max_active_reservations: number | null
          max_members: number | null
          name: string
          price_monthly: number
          slug: string
          stripe_price_id: string | null
        }
        Insert: {
          active?: boolean
          advance_booking_days: number
          annual_price?: number | null
          created_at?: string
          discount_floor?: number | null
          discount_percent: number
          display_name?: string | null
          first_year_discount?: number | null
          id?: string
          joining_fee?: number | null
          max_active_reservations?: number | null
          max_members?: number | null
          name: string
          price_monthly: number
          slug: string
          stripe_price_id?: string | null
        }
        Update: {
          active?: boolean
          advance_booking_days?: number
          annual_price?: number | null
          created_at?: string
          discount_floor?: number | null
          discount_percent?: number
          display_name?: string | null
          first_year_discount?: number | null
          id?: string
          joining_fee?: number | null
          max_active_reservations?: number | null
          max_members?: number | null
          name?: string
          price_monthly?: number
          slug?: string
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      memberships: {
        Row: {
          annual_end_date: string | null
          annual_start_date: string | null
          cancellation_requested_at: string | null
          cancelled_at: string | null
          comped: boolean
          created_at: string
          current_period_end: string | null
          founder_number: number | null
          founder_status_active: boolean | null
          id: string
          is_annual: boolean
          joining_fee_paid: boolean | null
          joining_fee_paid_at: string | null
          membership_paused: boolean | null
          pause_end_date: string | null
          pause_start_date: string | null
          plan_id: string
          plan_type: string
          reactivation_count: number | null
          signup_bonus_expires_at: string | null
          signup_bonus_hours: number | null
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          user_id: string
          year_one_discount_expires_at: string | null
        }
        Insert: {
          annual_end_date?: string | null
          annual_start_date?: string | null
          cancellation_requested_at?: string | null
          cancelled_at?: string | null
          comped?: boolean
          created_at?: string
          current_period_end?: string | null
          founder_number?: number | null
          founder_status_active?: boolean | null
          id?: string
          is_annual?: boolean
          joining_fee_paid?: boolean | null
          joining_fee_paid_at?: string | null
          membership_paused?: boolean | null
          pause_end_date?: string | null
          pause_start_date?: string | null
          plan_id: string
          plan_type?: string
          reactivation_count?: number | null
          signup_bonus_expires_at?: string | null
          signup_bonus_hours?: number | null
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          user_id: string
          year_one_discount_expires_at?: string | null
        }
        Update: {
          annual_end_date?: string | null
          annual_start_date?: string | null
          cancellation_requested_at?: string | null
          cancelled_at?: string | null
          comped?: boolean
          created_at?: string
          current_period_end?: string | null
          founder_number?: number | null
          founder_status_active?: boolean | null
          id?: string
          is_annual?: boolean
          joining_fee_paid?: boolean | null
          joining_fee_paid_at?: string | null
          membership_paused?: boolean | null
          pause_end_date?: string | null
          pause_start_date?: string | null
          plan_id?: string
          plan_type?: string
          reactivation_count?: number | null
          signup_bonus_expires_at?: string | null
          signup_bonus_hours?: number | null
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string
          year_one_discount_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parental_consents: {
        Row: {
          consented_at: string | null
          created_at: string
          id: string
          ip_address: string | null
          minor_user_id: string
          parent_email: string
          parent_name: string | null
          token: string
          token_expires_at: string
          waiver_snapshot: string | null
        }
        Insert: {
          consented_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          minor_user_id: string
          parent_email: string
          parent_name?: string | null
          token: string
          token_expires_at: string
          waiver_snapshot?: string | null
        }
        Update: {
          consented_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          minor_user_id?: string
          parent_email?: string
          parent_name?: string | null
          token?: string
          token_expires_at?: string
          waiver_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parental_consents_minor_user_id_fkey"
            columns: ["minor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          day_type: string
          id: string
          price_per_hour: number
          season_type: string
          time_type: string
          updated_at: string
        }
        Insert: {
          day_type: string
          id?: string
          price_per_hour: number
          season_type: string
          time_type: string
          updated_at?: string
        }
        Update: {
          day_type?: string
          id?: string
          price_per_hour?: number
          season_type?: string
          time_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string
          id: string
          is_minor: boolean
          last_name: string
          parental_consent_verified: boolean
          phone: string | null
          phone_verified: boolean
          role: string
          sms_consent: boolean
          stripe_customer_id: string | null
        }
        Insert: {
          created_at?: string
          first_name: string
          id: string
          is_minor?: boolean
          last_name: string
          parental_consent_verified?: boolean
          phone?: string | null
          phone_verified?: boolean
          role?: string
          sms_consent?: boolean
          stripe_customer_id?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          is_minor?: boolean
          last_name?: string
          parental_consent_verified?: boolean
          phone?: string | null
          phone_verified?: boolean
          role?: string
          sms_consent?: boolean
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          end_month: number
          id: string
          is_on_season: boolean
          name: string
          start_month: number
        }
        Insert: {
          created_at?: string
          end_month: number
          id?: string
          is_on_season: boolean
          name: string
          start_month: number
        }
        Update: {
          created_at?: string
          end_month?: number
          id?: string
          is_on_season?: boolean
          name?: string
          start_month?: number
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          body: string
          created_at: string
          direction: string
          id: string
          phone_number: string
          read_at: string | null
          telnyx_message_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          direction: string
          id?: string
          phone_number: string
          read_at?: string | null
          telnyx_message_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          id?: string
          phone_number?: string
          read_at?: string | null
          telnyx_message_id?: string | null
        }
        Relationships: []
      }
      sms_opt_outs: {
        Row: {
          opted_out_at: string
          phone_number: string
        }
        Insert: {
          opted_out_at?: string
          phone_number: string
        }
        Update: {
          opted_out_at?: string
          phone_number?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          converted_at: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          mobile: string | null
          privacy_agreed: boolean | null
          promo_code_sent: boolean | null
          promo_code_sent_at: string | null
          sms_opt_in: boolean | null
          source: string | null
          unsubscribe_token: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          mobile?: string | null
          privacy_agreed?: boolean | null
          promo_code_sent?: boolean | null
          promo_code_sent_at?: string | null
          sms_opt_in?: boolean | null
          source?: string | null
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          mobile?: string | null
          privacy_agreed?: boolean | null
          promo_code_sent?: boolean | null
          promo_code_sent_at?: string | null
          sms_opt_in?: boolean | null
          source?: string | null
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      member_effective_pricing: {
        Row: {
          day_type: string | null
          effective_rate: number | null
          membership_id: string | null
          plan_type: string | null
          pricing_rule_id: string | null
          rack_rate: number | null
          season_type: string | null
          time_type: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_founder_number: { Args: { member_id: string }; Returns: number }
      check_reservation_cap: { Args: { p_user_id: string }; Returns: boolean }
      validate_booking_window: {
        Args: { booking_start: string; p_user_id: string }
        Returns: boolean
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
    Enums: {},
  },
} as const
