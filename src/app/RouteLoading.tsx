interface RouteLoadingProps {
  message?: string;
}

export function RouteLoading({ message = 'Loading your notebook...' }: RouteLoadingProps) {
  return (
    <div className="h-full min-h-[50vh] flex items-center justify-center font-sans text-2xl animate-pulse">
      {message}
    </div>
  );
}
