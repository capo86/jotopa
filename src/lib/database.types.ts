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
    PostgrestVersion: "17.1"
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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          event_id: string
          id: string
          meta: Json
          target: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          meta?: Json
          target: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          meta?: Json
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invitation_assets: {
        Row: {
          alt: string
          bytes: number | null
          created_at: string
          created_by: string | null
          event_id: string
          height: number | null
          id: string
          status: string
          width: number | null
        }
        Insert: {
          alt: string
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          event_id: string
          height?: number | null
          id?: string
          status?: string
          width?: number | null
        }
        Update: {
          alt?: string
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          height?: number | null
          id?: string
          status?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_invitation_assets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invitation_designs: {
        Row: {
          created_at: string
          draft: Json
          event_id: string
          id: string
          public_enabled: boolean
          published: Json | null
          published_at: string | null
          published_revision: number | null
          revision: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft: Json
          event_id: string
          id?: string
          public_enabled?: boolean
          published?: Json | null
          published_at?: string | null
          published_revision?: number | null
          revision?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft?: Json
          event_id?: string
          id?: string
          public_enabled?: boolean
          published?: Json | null
          published_at?: string | null
          published_revision?: number | null
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invitation_designs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_member_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          email: string
          event_id: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["event_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          event_id: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["event_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          event_id?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["event_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_member_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_members: {
        Row: {
          created_at: string
          event_id: string
          id: string
          role: Database["public"]["Enums"]["event_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          role: Database["public"]["Enums"]["event_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          role?: Database["public"]["Enums"]["event_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tables: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_wall_settings: {
        Row: {
          audio_max_seconds: number
          closes_at: string | null
          created_at: string
          enabled: boolean
          event_id: string
          id: string
          opens_at: string | null
          public_revision: number
          stream_key: string
          updated_at: string
        }
        Insert: {
          audio_max_seconds?: number
          closes_at?: string | null
          created_at?: string
          enabled?: boolean
          event_id: string
          id?: string
          opens_at?: string | null
          public_revision?: number
          stream_key?: string
          updated_at?: string
        }
        Update: {
          audio_max_seconds?: number
          closes_at?: string | null
          created_at?: string
          enabled?: boolean
          event_id?: string
          id?: string
          opens_at?: string | null
          public_revision?: number
          stream_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_wall_settings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          hashtag: string | null
          id: string
          rsvp_deadline: string
          session_closes_at: string
          session_opens_at: string
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          tables_visible: boolean
          theme: Json
          timezone: string
          title: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          hashtag?: string | null
          id?: string
          rsvp_deadline: string
          session_closes_at: string
          session_opens_at?: string
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          tables_visible?: boolean
          theme?: Json
          timezone?: string
          title: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          hashtag?: string | null
          id?: string
          rsvp_deadline?: string
          session_closes_at?: string
          session_opens_at?: string
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          tables_visible?: boolean
          theme?: Json
          timezone?: string
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Relationships: []
      }
      guests: {
        Row: {
          attending_count: number | null
          companions_allowed: number
          companions_confirmed: number
          contact_consent: boolean
          created_at: string
          dietary_notes: string | null
          document_id: string | null
          email: string | null
          event_id: string
          full_name: string
          group_label: string | null
          id: string
          invite_token: string
          opted_out: boolean
          party_size: number | null
          phone: string | null
          rsvp_at: string | null
          rsvp_status: Database["public"]["Enums"]["guest_rsvp_status"]
          rsvp_version: number
          table_id: string | null
          updated_at: string
        }
        Insert: {
          attending_count?: number | null
          companions_allowed?: number
          companions_confirmed?: number
          contact_consent?: boolean
          created_at?: string
          dietary_notes?: string | null
          document_id?: string | null
          email?: string | null
          event_id: string
          full_name: string
          group_label?: string | null
          id?: string
          invite_token?: string
          opted_out?: boolean
          party_size?: number | null
          phone?: string | null
          rsvp_at?: string | null
          rsvp_status?: Database["public"]["Enums"]["guest_rsvp_status"]
          rsvp_version?: number
          table_id?: string | null
          updated_at?: string
        }
        Update: {
          attending_count?: number | null
          companions_allowed?: number
          companions_confirmed?: number
          contact_consent?: boolean
          created_at?: string
          dietary_notes?: string | null
          document_id?: string | null
          email?: string | null
          event_id?: string
          full_name?: string
          group_label?: string | null
          id?: string
          invite_token?: string
          opted_out?: boolean
          party_size?: number | null
          phone?: string | null
          rsvp_at?: string | null
          rsvp_status?: Database["public"]["Enums"]["guest_rsvp_status"]
          rsvp_version?: number
          table_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_table_event_fk"
            columns: ["table_id", "event_id"]
            isOneToOne: false
            referencedRelation: "event_tables"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      invitation_audio_assets: {
        Row: {
          bytes: number
          created_at: string
          created_by: string
          event_id: string
          id: string
          mime_type: string
          status: string
        }
        Insert: {
          bytes: number
          created_at?: string
          created_by: string
          event_id: string
          id?: string
          mime_type: string
          status?: string
        }
        Update: {
          bytes?: number
          created_at?: string
          created_by?: string
          event_id?: string
          id?: string
          mime_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_audio_assets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_id: string
          id: string
          invitation_id: string
          meta: Json
          occurred_at: string
          request_id: string | null
          type: string
          visit_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          invitation_id: string
          meta?: Json
          occurred_at?: string
          request_id?: string | null
          type: string
          visit_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          invitation_id?: string
          meta?: Json
          occurred_at?: string
          request_id?: string | null
          type?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitation_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_events_invitation_id_event_id_fkey"
            columns: ["invitation_id", "event_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      invitations: {
        Row: {
          channel: Database["public"]["Enums"]["invitation_channel"]
          created_at: string
          delivered_at: string | null
          error: string | null
          event_id: string
          first_opened_at: string | null
          guest_id: string
          id: string
          last_opened_at: string | null
          manual_request_id: string | null
          open_count: number
          provider_message_id: string | null
          queue_state: string
          sent_at: string | null
          sent_marked_by: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["invitation_channel"]
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event_id: string
          first_opened_at?: string | null
          guest_id: string
          id?: string
          last_opened_at?: string | null
          manual_request_id?: string | null
          open_count?: number
          provider_message_id?: string | null
          queue_state?: string
          sent_at?: string | null
          sent_marked_by?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["invitation_channel"]
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event_id?: string
          first_opened_at?: string | null
          guest_id?: string
          id?: string
          last_opened_at?: string | null
          manual_request_id?: string | null
          open_count?: number
          provider_message_id?: string | null
          queue_state?: string
          sent_at?: string | null
          sent_marked_by?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_guest_id_event_id_fkey"
            columns: ["guest_id", "event_id"]
            isOneToOne: false
            referencedRelation: "guest_roster"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "invitations_guest_id_event_id_fkey"
            columns: ["guest_id", "event_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "invitations_template_id_event_id_fkey"
            columns: ["template_id", "event_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      message_templates: {
        Row: {
          archived_at: string | null
          body: string
          channel: Database["public"]["Enums"]["invitation_channel"]
          created_at: string
          event_id: string
          id: string
          location_label: string
          name: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          channel?: Database["public"]["Enums"]["invitation_channel"]
          created_at?: string
          event_id: string
          id?: string
          location_label?: string
          name: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          channel?: Database["public"]["Enums"]["invitation_channel"]
          created_at?: string
          event_id?: string
          id?: string
          location_label?: string
          name?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          platform_role: Database["public"]["Enums"]["platform_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          platform_role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          platform_role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wall_post_media: {
        Row: {
          byte_count: number
          created_at: string
          duration_seconds: number | null
          event_id: string
          fingerprint: string
          id: string
          kind: string
          post_id: string
          slot: number
          state: string
        }
        Insert: {
          byte_count: number
          created_at?: string
          duration_seconds?: number | null
          event_id: string
          fingerprint: string
          id?: string
          kind: string
          post_id: string
          slot: number
          state?: string
        }
        Update: {
          byte_count?: number
          created_at?: string
          duration_seconds?: number | null
          event_id?: string
          fingerprint?: string
          id?: string
          kind?: string
          post_id?: string
          slot?: number
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "wall_post_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wall_post_media_post_id_event_id_fkey"
            columns: ["post_id", "event_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      wall_posts: {
        Row: {
          audio_count: number
          author_name: string
          body: string
          created_at: string
          event_id: string
          ever_approved: boolean
          guest_id: string | null
          id: string
          moderated_at: string | null
          moderated_by: string | null
          participant_name: string | null
          photo_count: number
          publication_revision: number
          request_hash: string
          request_id: string
          status: string
          submitted_at: string | null
        }
        Insert: {
          audio_count?: number
          author_name: string
          body?: string
          created_at?: string
          event_id: string
          ever_approved?: boolean
          guest_id?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          participant_name?: string | null
          photo_count?: number
          publication_revision?: number
          request_hash: string
          request_id: string
          status?: string
          submitted_at?: string | null
        }
        Update: {
          audio_count?: number
          author_name?: string
          body?: string
          created_at?: string
          event_id?: string
          ever_approved?: boolean
          guest_id?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          participant_name?: string | null
          photo_count?: number
          publication_revision?: number
          request_hash?: string
          request_id?: string
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wall_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wall_posts_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wall_posts_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      guest_roster: {
        Row: {
          event_id: string | null
          full_name: string | null
          id: string | null
          table_id: string | null
        }
        Insert: {
          event_id?: string | null
          full_name?: string | null
          id?: string | null
          table_id?: string | null
        }
        Update: {
          event_id?: string | null
          full_name?: string | null
          id?: string | null
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_table_event_fk"
            columns: ["table_id", "event_id"]
            isOneToOne: false
            referencedRelation: "event_tables"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
    }
    Functions: {
      accept_event_member_invite: { Args: { p_token: string }; Returns: string }
      admin_add_event_member: {
        Args: {
          p_event_id: string
          p_role: Database["public"]["Enums"]["event_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      apply_guest_import: {
        Args: { p_event_id: string; p_rows: Json }
        Returns: Json
      }
      archive_message_template: {
        Args: { p_event_id: string; p_template_id: string }
        Returns: undefined
      }
      assign_guest_table: {
        Args: { p_event_id: string; p_guest_id: string; p_table_id?: string }
        Returns: undefined
      }
      can_receive_wall_updates: { Args: { p_topic: string }; Returns: boolean }
      change_event_member_role: {
        Args: {
          p_event_id: string
          p_role: Database["public"]["Enums"]["event_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      check_wall_upload: {
        Args: { p_post_id: string; p_token: string }
        Returns: Json
      }
      complete_invitation_asset: {
        Args: {
          p_asset_id: string
          p_bytes: number
          p_height: number
          p_width: number
        }
        Returns: undefined
      }
      complete_invitation_audio: {
        Args: { p_asset_id: string }
        Returns: undefined
      }
      complete_wall_media: { Args: { p_media_id: string }; Returns: undefined }
      configure_event_access: {
        Args: { p_closes_at: string; p_event_id: string; p_opens_at: string }
        Returns: undefined
      }
      configure_event_wall: {
        Args: {
          p_audio_max_seconds: number
          p_closes_at: string
          p_enabled: boolean
          p_event_id: string
          p_opens_at: string
        }
        Returns: undefined
      }
      configure_table_visibility: {
        Args: { p_event_id: string; p_visible: boolean }
        Returns: undefined
      }
      create_event: {
        Args: {
          p_rsvp_deadline?: string
          p_slug: string
          p_starts_at: string
          p_timezone?: string
          p_title: string
          p_type: Database["public"]["Enums"]["event_type"]
        }
        Returns: string
      }
      create_event_member_invite: {
        Args: {
          p_email: string
          p_event_id: string
          p_role: Database["public"]["Enums"]["event_role"]
        }
        Returns: {
          invite_id: string
          token: string
        }[]
      }
      delete_event: { Args: { p_event_id: string }; Returns: undefined }
      delete_event_table: {
        Args: { p_event_id: string; p_table_id: string }
        Returns: undefined
      }
      delete_guest: {
        Args: { p_event_id: string; p_guest_id: string }
        Returns: undefined
      }
      delete_wall_post: { Args: { p_post_id: string }; Returns: Json }
      event_attendance_summary: { Args: { p_event_id: string }; Returns: Json }
      event_role_permissions: {
        Args: { p_role: Database["public"]["Enums"]["event_role"] }
        Returns: string[]
      }
      export_guests: {
        Args: {
          p_contact?: string
          p_event_id: string
          p_group?: string
          p_search?: string
        }
        Returns: Json
      }
      finish_wall_purge: { Args: { p_post_id: string }; Returns: undefined }
      get_guest_invitation_history: {
        Args: { p_event_id: string; p_guest_id: string; p_page?: number }
        Returns: Json
      }
      get_guest_invitation_token: {
        Args: { p_event_id: string; p_guest_id: string; p_rotate?: boolean }
        Returns: string
      }
      get_guest_invitation_tracking: {
        Args: { p_event_id: string; p_guest_ids: string[] }
        Returns: Json
      }
      get_my_event_role: {
        Args: { p_event_id: string }
        Returns: Database["public"]["Enums"]["event_role"]
      }
      get_wall_projection_status: {
        Args: { p_event_id: string }
        Returns: Json
      }
      guest_invitation: {
        Args: { p_request?: Json; p_token: string }
        Returns: Json
      }
      guest_wall: { Args: { p_request?: Json; p_token: string }; Returns: Json }
      has_event_permission: {
        Args: { event_id: string; permission: string }
        Returns: boolean
      }
      import_guests: {
        Args: {
          p_batch_id: string
          p_event_id: string
          p_preview?: boolean
          p_rows: Json
        }
        Returns: Json
      }
      import_table_assignments: {
        Args: {
          p_batch_id: string
          p_event_id: string
          p_preview?: boolean
          p_rows: Json
        }
        Returns: Json
      }
      invitation_asset_manifest: { Args: { p_token: string }; Returns: Json }
      invitation_audio_access: {
        Args: { p_asset_id: string; p_slug?: string; p_token?: string }
        Returns: Json
      }
      invitation_share_preview: { Args: { p_token: string }; Returns: Json }
      is_valid_guest_phone: { Args: { p_phone: string }; Returns: boolean }
      issue_wall_projection_access: {
        Args: { p_event_id: string; p_expires_at?: string }
        Returns: Json
      }
      list_event_tables: { Args: { p_event_id: string }; Returns: Json }
      list_event_team: {
        Args: { p_event_id: string }
        Returns: {
          full_name: string
          id: string
          role: Database["public"]["Enums"]["event_role"]
          user_id: string
        }[]
      }
      list_guests: {
        Args: {
          p_contact?: string
          p_event_id: string
          p_group?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
        }
        Returns: Json
      }
      list_invitation_queue: {
        Args: { p_bucket?: string; p_event_id: string; p_page?: number }
        Returns: Json
      }
      list_seating_guests: {
        Args: {
          p_event_id: string
          p_page?: number
          p_search?: string
          p_table?: string
        }
        Returns: Json
      }
      manual_invitation_action: {
        Args: {
          p_action: string
          p_event_id: string
          p_guest_id: string
          p_reference_id?: string
          p_request_id: string
          p_template_id?: string
        }
        Returns: Json
      }
      moderate_wall_post: {
        Args: { p_post_id: string; p_status: string }
        Returns: undefined
      }
      normalize_guest_input: {
        Args: { p_data: Json; p_import?: boolean }
        Returns: Json
      }
      normalize_guest_phone: { Args: { p_phone: string }; Returns: string }
      prepare_guest_import: { Args: { p_rows: Json }; Returns: Json }
      prepare_invitation_message: {
        Args: { p_event_id: string; p_guest_id: string; p_template_id: string }
        Returns: Json
      }
      preview_event_member_invite: {
        Args: { p_token: string }
        Returns: {
          event_title: string
          expires_at: string
          role: Database["public"]["Enums"]["event_role"]
        }[]
      }
      projection_wall: {
        Args: { p_access: string; p_request?: Json; p_slug: string }
        Returns: Json
      }
      public_invitation: { Args: { p_slug: string }; Returns: Json }
      publish_invitation_design: {
        Args: { p_event_id: string; p_expected_revision: number }
        Returns: undefined
      }
      remove_event_member: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: undefined
      }
      remove_invitation_asset: {
        Args: { p_asset_id: string; p_event_id: string }
        Returns: undefined
      }
      reserve_admin_user_creation: { Args: never; Returns: boolean }
      reserve_invitation_asset: {
        Args: { p_alt: string; p_event_id: string }
        Returns: string
      }
      reserve_invitation_audio: {
        Args: { p_bytes: number; p_event_id: string; p_mime_type: string }
        Returns: string
      }
      revoke_event_member_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      revoke_wall_projection_access: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      save_event_table: {
        Args: { p_event_id: string; p_name: string; p_table_id?: string }
        Returns: string
      }
      save_guest: {
        Args: { p_data: Json; p_event_id: string; p_guest_id?: string }
        Returns: string
      }
      save_invitation_design: {
        Args: {
          p_design: Json
          p_event_id: string
          p_expected_revision: number
        }
        Returns: number
      }
      save_message_template: {
        Args: {
          p_body: string
          p_channel?: Database["public"]["Enums"]["invitation_channel"]
          p_event_id: string
          p_location_label?: string
          p_name: string
          p_template_id?: string
        }
        Returns: string
      }
      sync_guest_wall: {
        Args: {
          p_after_revision?: number
          p_snapshot_revision?: number
          p_token: string
        }
        Returns: Json
      }
      unpublish_invitation_design: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      update_event: {
        Args: {
          p_event_id: string
          p_rsvp_deadline?: string
          p_slug: string
          p_starts_at: string
          p_status?: Database["public"]["Enums"]["event_status"]
          p_timezone: string
          p_title: string
          p_type: Database["public"]["Enums"]["event_type"]
        }
        Returns: undefined
      }
      valid_event_member_invite: {
        Args: { p_token: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          email: string
          event_id: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["event_role"]
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "event_member_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      event_role:
        | "owner"
        | "manager"
        | "invitations"
        | "content"
        | "moderator"
        | "checkin"
        | "viewer"
      event_status: "draft" | "active" | "closed"
      event_type: "wedding" | "birthday" | "anniversary" | "other"
      guest_rsvp_status: "pending" | "yes" | "no" | "maybe"
      invitation_channel: "whatsapp" | "email" | "link"
      invitation_status:
        | "draft"
        | "queued"
        | "sent"
        | "delivered"
        | "opened"
        | "responded"
        | "bounced"
        | "failed"
      platform_role: "organizer" | "super_admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      event_role: [
        "owner",
        "manager",
        "invitations",
        "content",
        "moderator",
        "checkin",
        "viewer",
      ],
      event_status: ["draft", "active", "closed"],
      event_type: ["wedding", "birthday", "anniversary", "other"],
      guest_rsvp_status: ["pending", "yes", "no", "maybe"],
      invitation_channel: ["whatsapp", "email", "link"],
      invitation_status: [
        "draft",
        "queued",
        "sent",
        "delivered",
        "opened",
        "responded",
        "bounced",
        "failed",
      ],
      platform_role: ["organizer", "super_admin"],
    },
  },
} as const
