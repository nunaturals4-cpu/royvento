import React from "react";
import { Platform } from "react-native";

interface Props {
  onSubmit: () => void;
  children: React.ReactNode;
}

export function WebFormWrapper({ onSubmit, children }: Props) {
  if (Platform.OS !== "web") {
    return <>{children}</>;
  }
  return React.createElement(
    "form",
    {
      onSubmit: (e: Event) => {
        e.preventDefault();
        onSubmit();
      },
    },
    children
  );
}
