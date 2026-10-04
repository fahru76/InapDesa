/**
 * Database types for the InapDesa schema (supabase/migrations/*_inapdesa_init.sql).
 * Shape matches `supabase gen types typescript` output, so you can regenerate with:
 *   npx supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PaymentPolicy = "deposit" | "full";
export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "paid_in_full"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "expired";
export type TransactionKind = "advance" | "balance" | "refund";
export type TransactionStatus = "pending" | "succeeded" | "failed" | "refunded";
export type TransactionProvider = "stripe" | "on_site" | "billplz";
export type PaymentProvider = "stripe" | "billplz";
export type HeroLayoutDb = "grand" | "mosaic" | "cinematic" | "split";
export type ThemePresetDb = "heritage" | "malam" | "tanah" | "pesisir" | "galeri" | "peranakan" | "classic";
export type CancellationPresetDb = "flexible" | "moderate" | "firm" | "non_refundable" | "custom";
export type NotificationKind = "confirmation" | "arrival_7d" | "arrival_1d" | "review_invite";

type PropertyRow = {
  id: string;
  host_id: string | null;
  slug: string;
  title: string;
  tagline: string | null;
  description: string;
  address_line: string | null;
  city: string;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  max_guests: number;
  max_infants: number;
  amenities: string[];
  house_rules: string[];
  check_in_time: string;
  check_out_time: string;
  currency: string;
  weekday_rate: number;
  weekend_rate: number;
  weekend_days: number[];
  cleaning_fee: number;
  security_deposit: number;
  min_nights: number;
  max_nights: number;
  payment_policy: PaymentPolicy;
  deposit_percent: number;
  cancellation_policy: string;
  host_display_name: string | null;
  host_bio: string | null;
  host_avatar_url: string | null;
  host_phone: string | null;
  host_languages: string[];
  host_since: string | null;
  is_published: boolean;
  translations: Json;
  sections: Json;
  accent_color: string;
  logo_url: string | null;
  hero_layout: HeroLayoutDb;
  theme_preset: ThemePresetDb;
  billplz_enabled: boolean;
  cancellation_preset: CancellationPresetDb;
  security_deposit_return_days: number;
  tourism_tax_enabled: boolean;
  tourism_tax_rate: number;
  tourism_tax_rooms: number;
  created_at: string;
  updated_at: string;
};

type BookingRow = {
  id: string;
  reference: string;
  access_token: string;
  property_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  special_requests: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  currency: string;
  nightly_breakdown: Json;
  subtotal: number;
  cleaning_fee: number;
  security_deposit: number;
  total_amount: number;
  payment_policy: PaymentPolicy;
  deposit_percent: number;
  amount_due_now: number;
  balance_due: number;
  amount_paid: number;
  status: BookingStatus;
  hold_expires_at: string | null;
  stripe_payment_intent_id: string | null;
  payment_provider: PaymentProvider;
  billplz_bill_id: string | null;
  balance_payment_intent_id: string | null;
  balance_bill_id: string | null;
  cancellation_preset: CancellationPresetDb;
  cancellation_policy_text: string | null;
  security_deposit_return_days: number;
  deposit_returned_amount: number | null;
  deposit_returned_at: string | null;
  deposit_return_note: string | null;
  locale: "en" | "ms";
  tourism_tax: number;
  foreign_guest: boolean;
  cancellation_reason: string | null;
  confirmed_at: string | null;
  checked_in_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  stay: unknown;
};

/** Makes the listed keys optional (columns with defaults / generated columns). */
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  __InternalSupabase: { PostgrestVersion: "13" };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: PropertyRow;
        Insert: WithOptional<
          PropertyRow,
          | "id"
          | "host_id"
          | "tagline"
          | "description"
          | "address_line"
          | "region"
          | "country"
          | "latitude"
          | "longitude"
          | "timezone"
          | "bedrooms"
          | "beds"
          | "bathrooms"
          | "max_infants"
          | "amenities"
          | "house_rules"
          | "check_in_time"
          | "check_out_time"
          | "currency"
          | "weekend_days"
          | "cleaning_fee"
          | "security_deposit"
          | "min_nights"
          | "max_nights"
          | "payment_policy"
          | "deposit_percent"
          | "cancellation_policy"
          | "host_display_name"
          | "host_bio"
          | "host_avatar_url"
          | "host_phone"
          | "host_languages"
          | "host_since"
          | "is_published"
          | "translations"
          | "sections"
          | "accent_color"
          | "logo_url"
          | "hero_layout"
          | "theme_preset"
          | "billplz_enabled"
          | "cancellation_preset"
          | "security_deposit_return_days"
          | "tourism_tax_enabled"
          | "tourism_tax_rate"
          | "tourism_tax_rooms"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<PropertyRow>;
        Relationships: [];
      };
      property_images: {
        Row: {
          id: string;
          property_id: string;
          storage_path: string | null;
          url: string;
          alt: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          storage_path?: string | null;
          url: string;
          alt?: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          storage_path?: string | null;
          url?: string;
          alt?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "property_images_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      property_guest_content: {
        Row: { property_id: string; sections: Json; updated_at: string };
        Insert: { property_id: string; sections?: Json; updated_at?: string };
        Update: { property_id?: string; sections?: Json; updated_at?: string };
        Relationships: [
          {
            foreignKeyName: "property_guest_content_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: true;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      blocked_dates: {
        Row: { id: string; property_id: string; date: string; reason: string | null; feed_id: string | null; created_at: string };
        Insert: { id?: string; property_id: string; date: string; reason?: string | null; feed_id?: string | null; created_at?: string };
        Update: { id?: string; property_id?: string; date?: string; reason?: string | null; feed_id?: string | null; created_at?: string };
        Relationships: [
          {
            foreignKeyName: "blocked_dates_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: BookingRow;
        Insert: WithOptional<
          Omit<BookingRow, "nights" | "stay">,
          | "id"
          | "reference"
          | "access_token"
          | "special_requests"
          | "children"
          | "infants"
          | "nightly_breakdown"
          | "cleaning_fee"
          | "security_deposit"
          | "amount_paid"
          | "status"
          | "hold_expires_at"
          | "stripe_payment_intent_id"
          | "payment_provider"
          | "billplz_bill_id"
          | "balance_payment_intent_id"
          | "balance_bill_id"
          | "cancellation_preset"
          | "cancellation_policy_text"
          | "security_deposit_return_days"
          | "deposit_returned_amount"
          | "deposit_returned_at"
          | "deposit_return_note"
          | "locale"
          | "tourism_tax"
          | "foreign_guest"
          | "cancellation_reason"
          | "confirmed_at"
          | "checked_in_at"
          | "cancelled_at"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<Omit<BookingRow, "nights" | "stay">>;
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          booking_id: string;
          property_id: string;
          kind: TransactionKind;
          status: TransactionStatus;
          provider: TransactionProvider;
          amount: number;
          currency: string;
          provider_ref: string | null;
          stripe_event_id: string | null;
          payment_method_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          property_id: string;
          kind: TransactionKind;
          status: TransactionStatus;
          provider?: TransactionProvider;
          amount: number;
          currency: string;
          provider_ref?: string | null;
          stripe_event_id?: string | null;
          payment_method_type?: string | null;
          created_at?: string;
        };
        Update: {
          status?: TransactionStatus;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      property_private: {
        Row: { property_id: string; ical_export_token: string; updated_at: string };
        Insert: { property_id: string; ical_export_token?: string; updated_at?: string };
        Update: { ical_export_token?: string; updated_at?: string };
        Relationships: [];
      };
      calendar_feeds: {
        Row: {
          id: string;
          property_id: string;
          name: string;
          url: string;
          last_synced_at: string | null;
          last_status: "ok" | "error" | null;
          last_error: string | null;
          last_event_count: number | null;
          created_at: string;
        };
        Insert: { id?: string; property_id: string; name: string; url: string };
        Update: {
          name?: string;
          last_synced_at?: string | null;
          last_status?: "ok" | "error" | null;
          last_error?: string | null;
          last_event_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_notifications: {
        Row: { booking_id: string; kind: NotificationKind; sent_at: string };
        Insert: { booking_id: string; kind: NotificationKind; sent_at?: string };
        Update: { sent_at?: string };
        Relationships: [
          {
            foreignKeyName: "booking_notifications_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          booking_id: string;
          property_id: string;
          rating: number;
          body: string;
          guest_display_name: string;
          stay_month: string;
          locale: "en" | "ms";
          host_reply: string | null;
          host_replied_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          property_id: string;
          rating: number;
          body: string;
          guest_display_name: string;
          stay_month: string;
          locale?: "en" | "ms";
        };
        Update: { host_reply?: string | null; host_replied_at?: string | null };
        Relationships: [
          {
            foreignKeyName: "reviews_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_unavailable_dates: {
        Args: { p_property_id: string; p_from: string; p_to: string };
        Returns: { day: string; kind: string }[];
      };
      release_expired_holds: {
        Args: { p_property_id?: string | null };
        Returns: number;
      };
      finalize_booking_payment: {
        Args: {
          p_payment_intent_id: string;
          p_amount: number;
          p_currency: string;
          p_event_id: string;
          p_payment_method_type: string;
        };
        Returns: string;
      };
      finalize_billplz_bill: {
        Args: { p_bill_id: string; p_amount: number; p_payment_method: string };
        Returns: string;
      };
      record_refund: {
        Args: { p_booking_id: string; p_refund_id: string; p_amount: number; p_currency: string };
        Returns: undefined;
      };
      host_check_in_booking: {
        Args: { p_booking_id: string; p_balance_collected: boolean };
        Returns: BookingRow;
      };
      host_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string };
        Returns: BookingRow;
      };
      finalize_balance_payment: {
        Args: {
          p_booking_id: string;
          p_provider: string;
          p_provider_ref: string;
          p_amount: number;
          p_currency: string;
          p_event_id: string;
          p_payment_method: string;
        };
        Returns: string;
      };
      host_record_deposit_return: {
        Args: { p_booking_id: string; p_amount: number; p_note: string };
        Returns: BookingRow;
      };
      host_reply_review: {
        Args: { p_review_id: string; p_reply: string };
        Returns: undefined;
      };
    };
    Enums: {
      payment_policy: PaymentPolicy;
      booking_status: BookingStatus;
      transaction_kind: TransactionKind;
      transaction_status: TransactionStatus;
      transaction_provider: TransactionProvider;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
