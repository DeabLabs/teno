import { useState } from 'react';

import { Button } from './ui/Button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from './ui/Dialog';

type WarningDialogProps = React.PropsWithChildren<{
	onConfirm?: React.FormEventHandler<HTMLButtonElement>;
	content: React.ReactNode;
	buttonProps?: React.ComponentProps<typeof Button>;
}>;

const WarningDialog = ({ children, content, buttonProps, onConfirm }: WarningDialogProps) => {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Are you sure absolutely sure?</DialogTitle>
					<DialogDescription>{content}</DialogDescription>
					<DialogFooter>
						<Button
							variant={'destructive'}
							type="submit"
							size={'sm'}
							{...buttonProps}
							onClick={(e) => {
								onConfirm?.(e);
								setOpen(false);
							}}
						>
							Confirm
						</Button>
					</DialogFooter>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	);
};

export default WarningDialog;
