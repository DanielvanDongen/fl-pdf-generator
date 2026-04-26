export const metadata = {
  title: "FL PDF Generator",
  description: "Football Leverage — Session PDF Generator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
