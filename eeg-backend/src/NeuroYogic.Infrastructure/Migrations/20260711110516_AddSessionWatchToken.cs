using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NeuroYogic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionWatchToken : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    StartedAt = table.Column<long>(type: "INTEGER", nullable: false),
                    EndedAt = table.Column<long>(type: "INTEGER", nullable: true),
                    EpochCount = table.Column<int>(type: "INTEGER", nullable: false),
                    MeanSattva = table.Column<double>(type: "REAL", nullable: false),
                    MeanRajas = table.Column<double>(type: "REAL", nullable: false),
                    MeanTamas = table.Column<double>(type: "REAL", nullable: false),
                    MeanDepthScore = table.Column<double>(type: "REAL", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sessions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Probes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SessionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Timestamp = table.Column<long>(type: "INTEGER", nullable: false),
                    DepthRating = table.Column<int>(type: "INTEGER", nullable: false),
                    Confidence = table.Column<int>(type: "INTEGER", nullable: false),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Probes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Probes_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "Sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Records",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SessionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Timestamp = table.Column<long>(type: "INTEGER", nullable: false),
                    ChittaBhumi = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    ChittaConfidence = table.Column<double>(type: "REAL", nullable: false),
                    ContemplativeDepth = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Swara = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Sattva = table.Column<double>(type: "REAL", nullable: false),
                    Rajas = table.Column<double>(type: "REAL", nullable: false),
                    Tamas = table.Column<double>(type: "REAL", nullable: false),
                    VrittiIndex = table.Column<double>(type: "REAL", nullable: false),
                    ContemplativeDepthScore = table.Column<double>(type: "REAL", nullable: false),
                    Faa = table.Column<double>(type: "REAL", nullable: false),
                    Plv = table.Column<double>(type: "REAL", nullable: false),
                    AlphaRelative = table.Column<double>(type: "REAL", nullable: false),
                    HighBetaRelative = table.Column<double>(type: "REAL", nullable: false),
                    GammaRelative = table.Column<double>(type: "REAL", nullable: false),
                    BloodOxygen = table.Column<double>(type: "REAL", nullable: true),
                    HeartRate = table.Column<double>(type: "REAL", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Records", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Records_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "Sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WatchTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SessionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TokenHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false),
                    ExpiresAt = table.Column<long>(type: "INTEGER", nullable: false),
                    RevokedAt = table.Column<long>(type: "INTEGER", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RedeemedByUserId = table.Column<Guid>(type: "TEXT", nullable: true),
                    RedeemedAt = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WatchTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WatchTokens_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "Sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Probes_SessionId_Timestamp",
                table: "Probes",
                columns: new[] { "SessionId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_Records_SessionId_Timestamp",
                table: "Records",
                columns: new[] { "SessionId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_UserId_StartedAt",
                table: "Sessions",
                columns: new[] { "UserId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WatchTokens_SessionId_ExpiresAt",
                table: "WatchTokens",
                columns: new[] { "SessionId", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WatchTokens_TokenHash",
                table: "WatchTokens",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Probes");

            migrationBuilder.DropTable(
                name: "Records");

            migrationBuilder.DropTable(
                name: "WatchTokens");

            migrationBuilder.DropTable(
                name: "Sessions");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
