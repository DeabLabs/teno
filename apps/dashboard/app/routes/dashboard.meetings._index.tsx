import { useNavigate } from '@remix-run/react';
import { useEffect } from 'react';

const DashboardMeetingsIndex = () => {
	const navigate = useNavigate();

	useEffect(() => {
		navigate('/dashboard/meetings/authored');
	}, []);

	return null;
};

export default DashboardMeetingsIndex;
