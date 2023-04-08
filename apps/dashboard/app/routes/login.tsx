import type { LoaderFunction } from '@remix-run/node';
import { Form } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';

export const loader: LoaderFunction = ({ request }) => {
	return checkAuth(request, { successRedirect: '/dashboard', failureRedirect: '' });
};

const Login = () => {
	return (
		<Form action="/auth/discord" method="post">
			<Button type="submit">Login with Discord</Button>
		</Form>
	);
};

export default Login;
