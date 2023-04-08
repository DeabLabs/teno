import type { LoaderFunction } from '@remix-run/node';
import { Form } from '@remix-run/react';

import { checkAuth } from '@/server/auth.utils.server';

export const loader: LoaderFunction = ({ request }) => {
	return checkAuth(request, { successRedirect: '/dashboard' });
};

const Login = () => {
	return (
		<Form action="/auth/discord" method="post">
			<button>Login with Discord</button>
		</Form>
	);
};

export default Login;
