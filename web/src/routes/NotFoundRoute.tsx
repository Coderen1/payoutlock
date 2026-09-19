import { Placeholder } from "./Placeholder";

export default function NotFoundRoute() {
  return (
    <Placeholder
      eyebrow="404"
      title="Page not found"
      description="That address doesn't exist."
      links={[
        { to: "/", label: "PayoutLock" },
        { to: "/app", label: "Protected Cash Out" },
      ]}
    />
  );
}
