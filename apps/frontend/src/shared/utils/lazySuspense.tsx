import React from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lazySuspense = <T extends React.ComponentType<any>>(
	load: () => Promise<{ default: T }>,
	fallback?: React.ReactNode
) => {
	const Lazy = React.lazy(load);

	const LazySuspended = (props: React.ComponentProps<T>) => (
		<React.Suspense fallback={fallback}>
			<Lazy {...props} />
		</React.Suspense>
	);

	return LazySuspended;
};