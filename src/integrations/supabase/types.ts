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
      listing_images: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          listing_id: string
          original_external_url: string
          original_storage_path: string | null
          position: number | null
          status: Database["public"]["Enums"]["listing_image_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          listing_id: string
          original_external_url: string
          original_storage_path?: string | null
          position?: number | null
          status?: Database["public"]["Enums"]["listing_image_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          listing_id?: string
          original_external_url?: string
          original_storage_path?: string | null
          position?: number | null
          status?: Database["public"]["Enums"]["listing_image_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "olx_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      olx_import_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          failed_count: number
          finished_at: string | null
          id: string
          processed_urls: number
          status: Database["public"]["Enums"]["import_job_status"]
          successful_count: number
          total_urls: number
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          processed_urls?: number
          status?: Database["public"]["Enums"]["import_job_status"]
          successful_count?: number
          total_urls?: number
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          processed_urls?: number
          status?: Database["public"]["Enums"]["import_job_status"]
          successful_count?: number
          total_urls?: number
          user_id?: string
        }
        Relationships: []
      }
      olx_listings: {
        Row: {
          ad_id: string | null
          attributes_json: Json | null
          category: string | null
          city: string | null
          created_at: string
          currency: string | null
          ddd: string | null
          description: string | null
          execution_id: string | null
          extracted_at: string | null
          id: string
          listed_at: string | null
          listing_id: string | null
          main_category: string | null
          neighborhood: string | null
          olx_delivery_enabled: boolean | null
          olx_pay_enabled: boolean | null
          phone_hashes: Json | null
          price: number | null
          region: string | null
          request_id: string | null
          seller_id: string | null
          seller_is_professional: boolean | null
          seller_name_hash: string | null
          source: string
          source_url: string
          state: string | null
          sub_category: string | null
          title: string | null
          updated_at: string
          user_id: string
          zip_code: string | null
        }
        Insert: {
          ad_id?: string | null
          attributes_json?: Json | null
          category?: string | null
          city?: string | null
          created_at?: string
          currency?: string | null
          ddd?: string | null
          description?: string | null
          execution_id?: string | null
          extracted_at?: string | null
          id?: string
          listed_at?: string | null
          listing_id?: string | null
          main_category?: string | null
          neighborhood?: string | null
          olx_delivery_enabled?: boolean | null
          olx_pay_enabled?: boolean | null
          phone_hashes?: Json | null
          price?: number | null
          region?: string | null
          request_id?: string | null
          seller_id?: string | null
          seller_is_professional?: boolean | null
          seller_name_hash?: string | null
          source?: string
          source_url: string
          state?: string | null
          sub_category?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          zip_code?: string | null
        }
        Update: {
          ad_id?: string | null
          attributes_json?: Json | null
          category?: string | null
          city?: string | null
          created_at?: string
          currency?: string | null
          ddd?: string | null
          description?: string | null
          execution_id?: string | null
          extracted_at?: string | null
          id?: string
          listed_at?: string | null
          listing_id?: string | null
          main_category?: string | null
          neighborhood?: string | null
          olx_delivery_enabled?: boolean | null
          olx_pay_enabled?: boolean | null
          phone_hashes?: Json | null
          price?: number | null
          region?: string | null
          request_id?: string | null
          seller_id?: string | null
          seller_is_professional?: boolean | null
          seller_name_hash?: string | null
          source?: string
          source_url?: string
          state?: string | null
          sub_category?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      processing_logs: {
        Row: {
          created_at: string
          id: string
          image_id: string | null
          job_id: string | null
          listing_id: string | null
          message: string | null
          metadata_json: Json | null
          status: Database["public"]["Enums"]["log_status"]
          type: Database["public"]["Enums"]["log_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_id?: string | null
          job_id?: string | null
          listing_id?: string | null
          message?: string | null
          metadata_json?: Json | null
          status: Database["public"]["Enums"]["log_status"]
          type: Database["public"]["Enums"]["log_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_id?: string | null
          job_id?: string | null
          listing_id?: string | null
          message?: string | null
          metadata_json?: Json | null
          status?: Database["public"]["Enums"]["log_status"]
          type?: Database["public"]["Enums"]["log_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_logs_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "listing_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "olx_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_logs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "olx_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      import_job_status: "pending" | "processing" | "completed" | "failed"
      listing_image_status: "pending" | "downloaded" | "failed"
      log_status: "success" | "error" | "warning" | "info"
      log_type: "job" | "listing" | "image"
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
      import_job_status: ["pending", "processing", "completed", "failed"],
      listing_image_status: ["pending", "downloaded", "failed"],
      log_status: ["success", "error", "warning", "info"],
      log_type: ["job", "listing", "image"],
    },
  },
} as const
