import { Link } from 'react-router-dom';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { homePath } from '../routes';

export function NotFoundScreen() {
  return (
    <>
      <ScreenHeading title="Page not found">This room is empty</ScreenHeading>
      <p>There is nothing at this address. Even the ghosts left.</p>
      <p>Check the address for a typing mistake, or start again from Home.</p>
      <p>
        <Link to={homePath()}>Go back to Home</Link>
      </p>
    </>
  );
}
