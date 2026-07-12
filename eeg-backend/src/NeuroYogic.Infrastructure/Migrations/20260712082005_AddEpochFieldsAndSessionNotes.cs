using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NeuroYogic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEpochFieldsAndSessionNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "Sessions",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<double>(
                name: "BetaRelative",
                table: "Records",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "DeltaRelative",
                table: "Records",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "ElapsedSeconds",
                table: "Records",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EpochNum",
                table: "Records",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "GunaLabel",
                table: "Records",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "ThetaRelative",
                table: "Records",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Notes",
                table: "Sessions");

            migrationBuilder.DropColumn(
                name: "BetaRelative",
                table: "Records");

            migrationBuilder.DropColumn(
                name: "DeltaRelative",
                table: "Records");

            migrationBuilder.DropColumn(
                name: "ElapsedSeconds",
                table: "Records");

            migrationBuilder.DropColumn(
                name: "EpochNum",
                table: "Records");

            migrationBuilder.DropColumn(
                name: "GunaLabel",
                table: "Records");

            migrationBuilder.DropColumn(
                name: "ThetaRelative",
                table: "Records");
        }
    }
}
