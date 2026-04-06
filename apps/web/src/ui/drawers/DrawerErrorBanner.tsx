import React from "react";

type DrawerErrorBannerProps = {
  messages: Array<string | null | undefined>;
};

export function DrawerErrorBanner(props: DrawerErrorBannerProps) {
  const visibleMessages = props.messages
    .map((message) => message?.trim())
    .filter((message): message is string => Boolean(message));

  if (visibleMessages.length === 0) {
    return null;
  }

  return (
    <div className="drawer-error-banner" role="alert" aria-live="assertive">
      {visibleMessages.map((message, index) => (
        <p key={`${index}-${message}`} className="error-text">
          {message}
        </p>
      ))}
    </div>
  );
}
