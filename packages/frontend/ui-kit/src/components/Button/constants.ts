import { ButtonVariant } from "./types";
import { SpinnerVariant } from "../Spinner";

export const BUTTON_VARIANT_TO_SPINNER_VARIANT: Record<ButtonVariant, SpinnerVariant> = {
  primary: "accent",
  secondary: "neutral",
  ghost: "neutral",
  danger: "danger",
} as const;
