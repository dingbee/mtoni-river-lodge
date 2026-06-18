import type { ReactNode, MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Generate a fresh booking-session id. Every time a guest starts a booking
 * from a room page we mint a new id so the wizard never reuses a previous
 * draft tied to a different room.
 */
export function newBookingSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

type StartBookingLinkProps = {
  /** Optional room slug — when present, the wizard pre-binds to that room and
   *  wipes any draft tied to a different room. */
  roomSlug?: string;
  className?: string;
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  "aria-label"?: string;
};

/**
 * Primary entry point into the booking wizard from a room context. Always
 * starts a fresh booking session — never resumes a previous draft.
 */
export function StartBookingLink({
  roomSlug,
  className,
  children,
  onClick,
  ...rest
}: StartBookingLinkProps) {
  const navigate = useNavigate();
  return (
    <a
      href="/book"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
        const session = newBookingSessionId();
        void navigate({
          to: "/book",
          search: { step: 1, session, room: roomSlug },
        });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}