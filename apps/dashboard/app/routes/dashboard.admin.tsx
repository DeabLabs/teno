import type { ActionArgs, LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import clsx from 'clsx';
import { Form, useNavigation } from '@remix-run/react';
import { Loader2 } from 'lucide-react';

import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';

export const loader = async ({ request }: LoaderArgs) => {
	return checkAuth(request);
};

const actions = ['fill-meeting-duration'] as const;
type ActionType = (typeof actions)[number];

export const action = async ({ request }: ActionArgs) => {
	const user = await checkAuth(request);
	const formData = await request.formData();
	const intent = formData.get('intent') as ActionType;

	switch (intent) {
		default:
			console.log(intent);
			return json({}, { status: 200 });
	}
};

type AdminActionButtonProps = React.ComponentProps<typeof Button> & {
	intent: ActionType;
	label: React.ReactNode;
};

const AdminActionButton = ({ intent, value: _, ...props }: AdminActionButtonProps) => {
	const { state } = useNavigation();
	const loading = state === 'submitting';

	return (
		<Button
			className="flex flex-1 basis-auto gap-2"
			variant="subtle"
			name="intent"
			value={intent}
			{...props}
			disabled={loading || props.disabled}
			type="submit"
		>
			{props.label}
			{loading && <Loader2 className="animate-spin" />}
		</Button>
	);
};

const Admin = () => {
	return (
		<Form method="post" replace className={clsx('container h-full flex flex-wrap mt-8 gap-8')}>
			<AdminActionButton intent="fill-meeting-duration" label="Approximate Empty Meeting Durations" />
		</Form>
	);
};

export default Admin;
