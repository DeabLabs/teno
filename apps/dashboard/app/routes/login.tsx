import { Form } from '@remix-run/react';

import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/Icons';

const Login = () => {
	return (
		<div className="flex flex-col min-w-screen min-h-screen justify-center items-center">
			<h1 className="flex p-4 gap-2 mb-8">
				<Icons.Logo />
				Teno Dashboard
			</h1>
			<Form action="/auth/discord" method="post">
				<Button type="submit">Login with Discord</Button>
			</Form>
		</div>
	);
};

export default Login;
